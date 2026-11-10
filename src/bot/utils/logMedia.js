const { AttachmentBuilder } = require('discord.js');

const MAX_FILES = 10;
const DOWNLOAD_TIMEOUT_MS = 10 * 1000;
// Discord's default upload limit; used when the guild limit is unknown.
const DEFAULT_UPLOAD_LIMIT = 10 * 1024 * 1024;

/**
 * Re-uploads message attachments so a log keeps the actual media after the original is deleted.
 * Attachments that cannot be copied (too big, already purged from the CDN) are returned as links.
 * @param {Iterable<import('discord.js').Attachment>} attachments
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ files: AttachmentBuilder[], links: string[], imageName: string|null, summary: string }>}
 */
async function collectAttachmentFiles(attachments, guild) {
  const list = [...(attachments || [])].slice(0, MAX_FILES);
  const files = [];
  const links = [];
  let imageName = null;
  let budget = guild?.maximumUploadLimit || DEFAULT_UPLOAD_LIMIT;

  for (const [index, attachment] of list.entries()) {
    if (attachment.size > budget) {
      links.push(`[${attachment.name}](${attachment.url})`);
      continue;
    }

    try {
      const response = await fetch(attachment.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      budget -= buffer.length;

      const extension = (attachment.name?.match(/\.[a-z0-9]{1,6}$/i) || [''])[0];
      const name = `media-${index + 1}${extension}`;
      files.push(new AttachmentBuilder(buffer, { name, description: attachment.name }));
      if (!imageName && attachment.contentType?.startsWith('image/')) imageName = name;
    } catch (_) {
      links.push(`[${attachment.name}](${attachment.url})`);
    }
  }

  const summary = list
    .map(a => `\`${a.name}\` (${Math.max(1, Math.round((a.size || 0) / 1024))} Ko)`)
    .join('\n');

  return { files, links, imageName, summary };
}

module.exports = { collectAttachmentFiles };
