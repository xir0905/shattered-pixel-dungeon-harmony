/*******************************************************************************
 * Copyright 2011 See AUTHORS file.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

package java.lang;

import com.google.gwt.core.client.GWT;

import java.util.ArrayList;

/**
 * Cooperative single-threaded emulation of {@link java.lang.Thread} for GWT.
 *
 * There is only one real thread of execution (the browser event loop). Threads
 * created by application code are "logical" threads: {@link #start()} runs the
 * body synchronously until it either completes or blocks in
 * {@link Object#wait()}. Blocking is implemented by throwing
 * {@link ThreadPauseError}, which unwinds the whole stack; the thread then
 * stays alive in a paused state, remembering the monitor object it waits on.
 *
 * {@link Object#notify()} / {@link Object#notifyAll()} (patched into the GWT
 * JRE emulation) re-enter the paused thread's body synchronously, from the top
 * of its {@link Runnable}. Re-entry from the top is semantically equivalent to
 * resuming for the usage patterns in Shattered Pixel Dungeon:
 *  - Actor.process() is idempotent while no actor is being processed
 *    (it re-selects the earliest actor, which is deterministic);
 *  - waits on sprites are guarded by re-checked predicates (isMoving).
 *
 * Thread.interrupt() sets the interrupted flag and, if the thread is paused,
 * re-enters it synchronously; the flag is then consumed through
 * {@link #interrupted()} by application code, mirroring JVM semantics.
 *
 * The main (render) thread is modelled as a Thread instance that can never
 * pause: wait() called from the main thread is a no-op, so the render loop is
 * never blocked.
 */
public class Thread implements Runnable {

	public static final int MIN_PRIORITY = 1;
	public static final int NORM_PRIORITY = 5;
	public static final int MAX_PRIORITY = 10;

	/** All live (started, not finished) logical threads. */
	private static final ArrayList<Thread> liveThreads = new ArrayList<Thread>();

	/** The single real thread, used when no logical thread is running. */
	private static final Thread mainThread = new Thread(null, "main");

	private static Thread currentThread = mainThread;

	private static long nextId = 0;

	private final long id;
	private final Runnable target;
	private String name;
	private int priority = NORM_PRIORITY;
	private boolean started = false;
	private boolean alive = false;
	private boolean interrupted = false;
	/** Non-null while paused: the monitor object this thread waits on. */
	private Object waitingOn = null;

	public Thread() {
		this(null, null);
	}

	public Thread(String name) {
		this(null, name);
	}

	public Thread(Runnable target) {
		this(target, null);
	}

	public Thread(Runnable target, String name) {
		this.id = nextId++;
		this.target = target;
		this.name = name != null ? name : "Thread-" + id;
	}

	@Override
	public void run() {
		if (target != null) {
			target.run();
		}
	}

	/**
	 * Runs one execution slice of this logical thread: switches
	 * {@link #currentThread}, invokes {@link #run()}, and either finishes the
	 * thread (normal return) or leaves it paused (ThreadPauseError caught).
	 */
	private void runSlice() {
		Thread previous = currentThread;
		currentThread = this;
		try {
			run();
			finish();
		} catch (ThreadPauseError pause) {
			// paused: stay alive, waitingOn recorded by cooperativeWait()
		} finally {
			currentThread = previous;
		}
	}

	private void finish() {
		alive = false;
		waitingOn = null;
		liveThreads.remove(this);
	}

	public synchronized void start() {
		if (started) {
			throw new RuntimeException("Thread already started: " + name);
		}
		started = true;
		alive = true;
		liveThreads.add(this);
		runSlice();
	}

	// ------------------------------------------------------------------
	// cooperative monitor support (called from patched java.lang.Object)
	// ------------------------------------------------------------------

	static void cooperativeWait(Object monitor) {
		Thread thread = currentThread;
		if (thread == mainThread) {
			// The render thread can never pause: wait() is a no-op.
			return;
		}
		thread.waitingOn = monitor;
		throw new ThreadPauseError();
	}

	static void cooperativeNotify(Object monitor) {
		for (int i = liveThreads.size() - 1; i >= 0; i--) {
			Thread thread = liveThreads.get(i);
			if (thread.alive && thread.waitingOn == monitor) {
				thread.waitingOn = null;
				thread.runSlice();
				return;
			}
		}
	}

	static void cooperativeNotifyAll(Object monitor) {
		for (int i = liveThreads.size() - 1; i >= 0; i--) {
			Thread thread = liveThreads.get(i);
			if (thread.alive && thread.waitingOn == monitor) {
				thread.waitingOn = null;
				thread.runSlice();
			}
		}
	}

	// ------------------------------------------------------------------
	// interruption
	// ------------------------------------------------------------------

	public void interrupt() {
		interrupted = true;
		if (waitingOn != null) {
			waitingOn = null;
			runSlice();
		}
	}

	public boolean isInterrupted() {
		return interrupted;
	}

	/** Returns and clears the interrupted flag of the current thread. */
	public static boolean interrupted() {
		Thread thread = currentThread;
		boolean wasInterrupted = thread.interrupted;
		thread.interrupted = false;
		return wasInterrupted;
	}

	// ------------------------------------------------------------------
	// queries and setters
	// ------------------------------------------------------------------

	public static Thread currentThread() {
		return currentThread;
	}

	public boolean isAlive() {
		return alive;
	}

	public String getName() {
		return name;
	}

	public final void setName(String name) {
		this.name = name;
	}

	public final void setPriority(int priority) {
		this.priority = priority;
	}

	public final int getPriority() {
		return priority;
	}

	public long getId() {
		return id;
	}

	/**
	 * The GWT build has no class loaders; org.json's ResourceBundle constructor
	 * references this API but is never used by the game.
	 */
	public ClassLoader getContextClassLoader() {
		return null;
	}

	public StackTraceElement[] getStackTrace() {
		return new StackTraceElement[0];
	}

	// ------------------------------------------------------------------
	// static helpers
	// ------------------------------------------------------------------

	public static void sleep(long millis) throws InterruptedException {
		if (currentThread.interrupted) {
			currentThread.interrupted = false;
			throw new InterruptedException();
		}
		// Otherwise a no-op: cooperative threads only ever pause in wait().
	}

	public static void yield() {
		// no-op
	}

	public interface UncaughtExceptionHandler {
		void uncaughtException(Thread t, Throwable e);
	}

	public static void setDefaultUncaughtExceptionHandler(final UncaughtExceptionHandler javaHandler) {
		GWT.setUncaughtExceptionHandler(new GWT.UncaughtExceptionHandler() {
			@Override
			public void onUncaughtException(Throwable e) {
				javaHandler.uncaughtException(currentThread, e);
			}
		});
	}

	public String toString() {
		return "Thread[" + name + "," + priority + "]";
	}
}
