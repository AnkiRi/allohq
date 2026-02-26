export interface UnsplashInput {
  prompt: string;
}

interface UnsplashSearchResponse {
  results: {
    urls: {
      raw: string;
      full: string;
      regular: string;
      small: string;
      thumb: string;
    };
  }[];
}

/**
 * Search Unsplash for a stock photo matching the prompt.
 * Returns the regular-sized image URL on success, or null if no results / error.
 * Cost: free (with attribution required per Unsplash guidelines).
 */
export async function searchUnsplash(
  input: UnsplashInput,
): Promise<string | null> {
  const accessKey = process.env["UNSPLASH_ACCESS_KEY"];
  if (!accessKey) {
    console.log("[Image/Unsplash] UNSPLASH_ACCESS_KEY not set, skipping");
    return null;
  }

  try {
    // Extract key terms from the prompt for a better search query
    // Take the first ~100 chars to keep the query reasonable
    const query = input.prompt.slice(0, 100);

    console.log(
      `[Image/Unsplash] Searching for: "${query.slice(0, 60)}..."`,
    );

    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("orientation", "landscape");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
    });

    if (!response.ok) {
      console.log(
        `[Image/Unsplash] API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as UnsplashSearchResponse;

    if (!data.results || data.results.length === 0) {
      console.log("[Image/Unsplash] No results found");
      return null;
    }

    // Use regular URL for reasonable size (1080px wide)
    const imageUrl = data.results[0]!.urls.regular;

    console.log(`[Image/Unsplash] Success — ${imageUrl.slice(0, 80)}...`);
    return imageUrl;
  } catch (err) {
    console.log(
      `[Image/Unsplash] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
