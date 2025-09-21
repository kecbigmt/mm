export type AmbiguousShortIdError = Readonly<{
  kind: "ambiguous_short_id";
  shortId: string;
  foundCount: number;
  message: string;
}>;

export const createAmbiguousShortIdError = (
  shortId: string,
  foundCount: number,
): AmbiguousShortIdError => ({
  kind: "ambiguous_short_id",
  shortId,
  foundCount,
  message: `Short ID '${shortId}' is ambiguous: found ${foundCount} items`,
});
