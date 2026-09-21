import { useEffect } from "react";

// Sets the document title for the current route. The lobby pages use
// it so a crawler or a classifier that reads the rendered page sees "Sign in"
// rather than the bare product name on a credential form; the app shell
// keeps the default title from index.html for everything else.
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
