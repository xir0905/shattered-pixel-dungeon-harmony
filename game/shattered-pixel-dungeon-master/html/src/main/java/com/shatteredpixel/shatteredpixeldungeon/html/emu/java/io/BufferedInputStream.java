package java.io;

/**
 * GWT emulation of java.io.BufferedInputStream for Shattered Pixel Dungeon
 * (GWT web port). The wrapped streams in the game (ByteArrayInputStream from
 * the GWT local storage file handles) already support mark/reset, so this
 * simply passes through while reporting mark support as the real class does.
 */
public class BufferedInputStream extends FilterInputStream {

	public BufferedInputStream(InputStream in) {
		super(in);
	}

	public BufferedInputStream(InputStream in, int size) {
		super(in);
	}

	@Override
	public boolean markSupported() {
		return true;
	}
}
