// worker-queue/src/lib/utils/markdown.ts
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Configure marked with useful options
marked.setOptions({
  breaks: true, // Convert line breaks to <br>
  gfm: true, // Enable GitHub Flavored Markdown
});

// Safe HTML sanitization options
const sanitizeOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "del",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "img",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target"],
    img: ["src", "alt", "title", "width", "height"],
    code: ["class"],
    pre: ["class"],
  },
  allowedClasses: {
    code: ["language-*"],
    pre: ["language-*"],
  },
  transformTags: {
    a: (tagName: string, attribs: any) => {
      // Make external links open in new tab
      if (
        attribs.href &&
        (attribs.href.startsWith("http://") ||
          attribs.href.startsWith("https://"))
      ) {
        attribs.target = "_blank";
        attribs.rel = "noopener noreferrer";
      }
      return { tagName, attribs };
    },
  },
};

/**
 * Convert markdown to safe HTML
 */
export function renderMarkdown(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";

  try {
    // marked v14 returns string when async is false (which is the default)
    const html = marked.parse(text.trim()) as string;
    return sanitizeHtml(html, sanitizeOptions);
  } catch (error) {
    console.error("Error rendering markdown:", error);
    // Fallback to escaped plain text
    return escapeHtml(text);
  }
}

// Add a function to get the appropriate prose classes
export function getProseClasses(
  size: "sm" | "base" | "lg" = "base",
  removeMaxWidth = true,
): string {
  const sizeClass = size === "base" ? "prose" : `prose-${size}`;
  const maxWidth = removeMaxWidth ? "max-w-none" : "";

  return `${sizeClass} prose-gray dark:prose-invert max-w-none
				prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700
				prose-strong:text-gray-900 prose-a:text-blue-600 prose-blockquote:text-gray-700
				dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300
				dark:prose-strong:text-white dark:prose-a:text-blue-400 dark:prose-blockquote:text-gray-300
				dark:prose-hr:border-gray-700 ${maxWidth}`.trim();
}

/**
 * Escape HTML characters for server environment
 */
function escapeHtml(text: string): string {
  // Server-side HTML escaping
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip markdown formatting and return plain text
 */
export function stripMarkdown(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";

  try {
    // Simple regex to remove common markdown formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
      .replace(/\*(.*?)\*/g, "$1") // Italic
      .replace(/`(.*?)`/g, "$1") // Inline code
      .replace(/#+\s/g, "") // Headers
      .replace(/>\s/g, "") // Blockquotes
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // Images
      .trim();
  } catch (error) {
    console.error("Error stripping markdown:", error);
    return text;
  }
}

/**
 * Get a preview of markdown content (first N characters, stripped of formatting)
 */
export function getMarkdownPreview(
  text: string | null | undefined,
  maxLength: number = 150,
): string {
  if (!text) return "";

  const stripped = stripMarkdown(text);
  if (stripped.length <= maxLength) return stripped;

  return stripped.substring(0, maxLength).trim() + "...";
}

/**
 * Check if text contains markdown formatting
 */
export function hasMarkdownFormatting(
  text: string | null | undefined,
): boolean {
  if (!text || typeof text !== "string") return false;

  const markdownPatterns = [
    /\*\*.*?\*\*/, // Bold
    /\*.*?\*/, // Italic
    /`.*?`/, // Inline code
    /#+\s/, // Headers
    />\s/, // Blockquotes
    /\[.*?\]\(.*?\)/, // Links
    /!\[.*?\]\(.*?\)/, // Images
    /^\s*[-*+]\s/m, // Lists
    /^\s*\d+\.\s/m, // Numbered lists
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}
