/*******************************************************************************
 * Cooperative GWT Thread emulation: internal control-flow error.
 *
 * Thrown by java.lang.Object.wait() (patched) to unwind the stack of a
 * cooperatively scheduled thread so that it yields back to the single
 * JavaScript event loop. Caught only by Thread.runSlice().
 *
 * Extends Error (not RuntimeException) so that no catch (Exception) block
 * in application code can ever swallow it.
 ******************************************************************************/
package java.lang;

class ThreadPauseError extends Error {

	ThreadPauseError() {
		super();
	}
}
