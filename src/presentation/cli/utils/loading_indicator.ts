/**
 * Simple loading indicator for CLI operations.
 * Displays a spinner with a message while an async operation runs.
 * Clears the line on completion (silent on success).
 */

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

export type LoadingIndicator = {
  start(message: string): void;
  stop(): void;
};

export const createLoadingIndicator = (): LoadingIndicator => {
  let intervalId: number | undefined;
  let frameIndex = 0;

  const encoder = new TextEncoder();

  return {
    start(message: string) {
      frameIndex = 0;

      // Write initial frame
      Deno.stderr.writeSync(encoder.encode(`${SPINNER_FRAMES[0]} ${message}`));

      intervalId = setInterval(() => {
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
        // Move cursor to start of line and rewrite
        Deno.stderr.writeSync(
          encoder.encode(`\r${SPINNER_FRAMES[frameIndex]} ${message}`),
        );
      }, SPINNER_INTERVAL_MS);
    },

    stop() {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
      // Clear the line (carriage return + clear to end of line)
      Deno.stderr.writeSync(encoder.encode("\r\x1b[K"));
    },
  };
};

/**
 * Executes an async operation with a loading indicator.
 * Shows the spinner during execution, clears on completion.
 *
 * @param message - Message to display next to spinner (e.g., "Pulling...")
 * @param operation - Async operation to execute
 * @returns The result of the operation
 */
export async function withLoadingIndicator<T>(
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  const indicator = createLoadingIndicator();
  indicator.start(message);
  try {
    return await operation();
  } finally {
    indicator.stop();
  }
}
