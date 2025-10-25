// apps/web/src/routes/api/admin/emails/attachments/+server.ts
import type { RequestHandler } from './$types';
import sharp from 'sharp';
import { ApiResponse } from '$lib/utils/api-response';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain'];

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const email_id = url.searchParams.get('email_id');
		const shared_only = url.searchParams.get('shared_only') === 'true';
		const images_only = url.searchParams.get('images_only') === 'true';

		let query = supabase
			.from('email_attachments')
			.select('*')
			.order('created_at', { ascending: false });

		if (email_id) {
			query = query.eq('email_id', email_id);
		}

		if (shared_only) {
			query = query.ilike('storage_path', '%/shared/%');
		}

		if (images_only) {
			query = query.eq('is_image', true);
		}

		const { data: attachments, error } = await query;

		if (error) throw error;

		// Get signed URLs for each attachment
		const attachmentsWithUrls = await Promise.all(
			(attachments || []).map(async (attachment) => {
				try {
					const { data: signedUrl } = await supabase.storage
						.from('email-attachments')
						.createSignedUrl(attachment.storage_path, 60 * 60); // 1 hour

					return {
						...attachment,
						url: signedUrl?.signedUrl || null
					};
				} catch (error) {
					console.error(`Error getting signed URL for ${attachment.filename}:`, error);
					return {
						...attachment,
						url: null
					};
				}
			})
		);

		return ApiResponse.success({ attachments: attachmentsWithUrls });
	} catch (error) {
		console.error('Error fetching attachments:', error);
		return ApiResponse.internalError(error, 'Failed to fetch attachments');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const email_id = formData.get('email_id') as string;
		const is_shared = formData.get('is_shared') === 'true';
		const is_inline = formData.get('is_inline') === 'true';

		if (!file) {
			return ApiResponse.badRequest('No file provided');
		}

		if (file.size > MAX_FILE_SIZE) {
			return ApiResponse.badRequest('File too large. Maximum size is 10MB');
		}

		if (!ALLOWED_FILE_TYPES.includes(file.type)) {
			return ApiResponse.badRequest('File type not allowed');
		}

		// Generate unique filename
		const fileExtension = file.name.split('.').pop();
		const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;

		// Determine storage path
		const folder = is_shared ? 'shared' : `emails/${email_id}`;
		const storagePath = `${folder}/${uniqueFilename}`;

		// Process file
		const fileBuffer = await file.arrayBuffer();
		let processedBuffer = Buffer.from(fileBuffer);
		let optimizedVersions: Record<string, string> = {};
		let imageWidth: number | null = null;
		let imageHeight: number | null = null;

		// If it's an image, optimize it
		if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
			try {
				const image = sharp(processedBuffer);
				const metadata = await image.metadata();

				imageWidth = metadata.width || null;
				imageHeight = metadata.height || null;

				// Create optimized versions
				const webpBuffer = await image.webp({ quality: 85 }).toBuffer();
				const thumbnailBuffer = await image
					.resize(300, 300, { fit: 'inside' })
					.webp({ quality: 80 })
					.toBuffer();

				// Upload optimized versions
				const webpPath = `${folder}/optimized/${uniqueFilename.replace(/\.[^/.]+$/, '.webp')}`;
				const thumbnailPath = `${folder}/thumbnails/${uniqueFilename.replace(/\.[^/.]+$/, '.webp')}`;

				const [webpUpload, thumbnailUpload] = await Promise.all([
					supabase.storage
						.from('email-attachments')
						.upload(webpPath, webpBuffer, { contentType: 'image/webp' }),
					supabase.storage
						.from('email-attachments')
						.upload(thumbnailPath, thumbnailBuffer, { contentType: 'image/webp' })
				]);

				if (!webpUpload.error && !thumbnailUpload.error) {
					optimizedVersions = {
						webp: webpPath,
						thumbnail: thumbnailPath
					};
				}
			} catch (error) {
				console.error('Error optimizing image:', error);
				// Continue without optimization
			}
		}

		// Upload original file
		const { error: uploadError } = await supabase.storage
			.from('email-attachments')
			.upload(storagePath, processedBuffer, {
				contentType: file.type,
				upsert: false
			});

		if (uploadError) throw uploadError;

		// Generate Content-ID for inline images
		const cid = is_inline ? `${uniqueFilename}@build-os.com` : null;

		// Save attachment record
		const { data: attachment, error: insertError } = await supabase
			.from('email_attachments')
			.insert({
				email_id: email_id || null,
				filename: uniqueFilename,
				original_filename: file.name,
				file_size: file.size,
				content_type: file.type,
				storage_path: storagePath,
				storage_bucket: 'email-attachments',
				is_image: ALLOWED_IMAGE_TYPES.includes(file.type),
				image_width: imageWidth,
				image_height: imageHeight,
				optimized_versions: optimizedVersions,
				is_inline,
				cid,
				created_by: user.id
			})
			.select()
			.single();

		if (insertError) throw insertError;

		// Get signed URL for immediate use
		const { data: signedUrl } = await supabase.storage
			.from('email-attachments')
			.createSignedUrl(storagePath, 60 * 60); // 1 hour

		return ApiResponse.success({
			attachment: {
				...attachment,
				url: signedUrl?.signedUrl || null
			}
		});
	} catch (error) {
		console.error('Error uploading attachment:', error);
		return ApiResponse.internalError(error, 'Failed to upload attachment');
	}
};

export const DELETE: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const attachment_id = url.searchParams.get('id');

		if (!attachment_id) {
			return ApiResponse.badRequest('Attachment ID required');
		}

		// Get attachment details
		const { data: attachment, error: fetchError } = await supabase
			.from('email_attachments')
			.select('*')
			.eq('id', attachment_id)
			.single();

		if (fetchError) {
			if (fetchError.code === 'PGRST116') {
				return ApiResponse.notFound('Attachment');
			}
			throw fetchError;
		}

		// Delete files from storage
		const filesToDelete = [attachment.storage_path];

		// Add optimized versions if they exist
		if (attachment.optimized_versions && typeof attachment.optimized_versions === 'object') {
			Object.values(attachment.optimized_versions).forEach((path) => {
				if (typeof path === 'string') {
					filesToDelete.push(path);
				}
			});
		}

		// Delete files from storage
		await Promise.all(
			filesToDelete.map((path) => supabase.storage.from('email-attachments').remove([path]))
		);

		// Delete attachment record
		const { error: deleteError } = await supabase
			.from('email_attachments')
			.delete()
			.eq('id', attachment_id);

		if (deleteError) throw deleteError;

		return ApiResponse.success({ success: true });
	} catch (error) {
		console.error('Error deleting attachment:', error);
		return ApiResponse.internalError(error, 'Failed to delete attachment');
	}
};
