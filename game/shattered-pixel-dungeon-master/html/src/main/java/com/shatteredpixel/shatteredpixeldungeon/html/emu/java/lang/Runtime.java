package java.lang;

/** Minimal GWT emulation of java.lang.Runtime for Shattered Pixel Dungeon. */
public class Runtime {

	private static final Runtime INSTANCE = new Runtime();

	private Runtime() {
	}

	public static Runtime getRuntime() {
		return INSTANCE;
	}

	public int availableProcessors() {
		// Browsers do not expose core counts; report more than one so the
		// game does not deprioritize its (cooperative) actor thread.
		return 4;
	}

	public long totalMemory() {
		return 512 * 1024 * 1024L;
	}

	public long freeMemory() {
		return 256 * 1024 * 1024L;
	}

	public long maxMemory() {
		return 1024 * 1024 * 1024L;
	}

	public void gc() {
	}

	public void exit(int status) {
	}
}
