// apps/web/src/lib/types/form.ts
export interface FieldConfig {
	type:
		| 'text'
		| 'textarea'
		| 'select'
		| 'date'
		| 'datetime'
		| 'datetime-local'
		| 'number'
		| 'tags'
		| 'checkbox'
		| 'radio';
	label: string;
	required?: boolean;
	placeholder?: string;
	description?: string;
	options?: string[];
	min?: number;
	max?: number;
	rows?: number;
	markdown?: boolean;
	defaultValue?: any;
	copyButton?: boolean; // Add support for copy button on textarea fields
}

export interface FormConfig {
	[fieldName: string]: FieldConfig;
}

export interface FormModalProps {
	isOpen: boolean;
	title: string;
	submitText: string;
	loadingText: string;
	formConfig: FormConfig;
	initialData?: Record<string, any>;
	onSubmit: (data: Record<string, any>) => Promise<void>;
	onClose: () => void;
	size?: 'sm' | 'md' | 'lg' | 'xl';
}
