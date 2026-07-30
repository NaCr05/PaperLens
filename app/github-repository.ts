export function findGitHubRepository(text: string) {
  // PDF text extraction often inserts spaces around URL punctuation or line
  // breaks a repository URL immediately after the abstract.
  const match = text.match(/(?:https?\s*:\s*\/\s*\/\s*)?(?:www\s*\.\s*)?github\s*\.\s*com\s*\/\s*([A-Za-z0-9_.-]+)\s*\/\s*([A-Za-z0-9_.-]+)/i);
  if (!match) return "";
  const owner = match[1].replace(/[),.;:]+$/, "");
  const repository = match[2].replace(/\.git$/i, "").replace(/[),.;:]+$/, "");
  return owner && repository ? `https://github.com/${owner}/${repository}` : "";
}
