export function combineDocuments(documents: { pageContent: string; metadata?: any }[]): string {
  if (!documents || documents.length === 0) {
    return "";
  }

  return documents
    .map((doc, index) => {
      const content = doc.pageContent.trim();
      const metadata = doc.metadata;
      
      // Add section separator for better readability
      let section = `--- Document ${index + 1} ---\n`;
      
      // Add metadata context if available
      if (metadata?.source) {
        section += `Source: ${metadata.source}\n`;
      }
      if (metadata?.filename) {
        section += `File: ${metadata.filename}\n`;
      }
      
      section += `\n${content}\n`;
      
      return section;
    })
    .join("\n");
}