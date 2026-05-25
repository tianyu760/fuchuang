export function sanitizeLegalText(input: string): string {
  return String(input || '')
    .replace(/�?/g, '')
    .replace(/�/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/(^|[\s>])\/(span|h1|h2|h3|h4|h5|h6|p|button|div|li|ul|ol|section|article)>/gi, '$1')
    .replace(/^\s*[#＃]{1,6}\s+/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeLegalHtml(input: string): string {
  return String(input || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\uFEFF/g, '')
    .replace(/�?/g, '')
    .replace(/�/g, '');
}
