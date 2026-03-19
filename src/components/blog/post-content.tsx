export function PostContent({ html }: { html: string }) {
  return (
    <div
      className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-display prose-headings:font-normal prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-strong:text-foreground prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-table:text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
