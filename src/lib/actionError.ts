// Next.js redacts a thrown Error's `message` to a generic
// "An error occurred in the Server Components render..." string once it
// crosses a Server Action boundary in production — even when the client
// catches it with try/catch (dev mode preserves the real message, which is
// why this wasn't caught in testing). See node_modules/next/dist/docs/
// 01-app/01-getting-started/10-error-handling.md: "avoid using try/catch
// blocks and throw errors [for expected errors]. Instead, model expected
// errors as return values."
//
// Every "use server" action that needs to surface a business/validation
// message to the client must therefore return an ActionError instead of
// throwing. Truly unexpected errors (programmer bugs) can still throw —
// there's no client-side message to preserve for those anyway.
const ACTION_ERROR_TAG = "__sportonicaActionError" as const;

export type ActionError = { [ACTION_ERROR_TAG]: true; message: string };

export function actionError(message: string): ActionError {
  return { [ACTION_ERROR_TAG]: true, message };
}

export function isActionError(value: unknown): value is ActionError {
  return typeof value === "object" && value !== null && ACTION_ERROR_TAG in value;
}
