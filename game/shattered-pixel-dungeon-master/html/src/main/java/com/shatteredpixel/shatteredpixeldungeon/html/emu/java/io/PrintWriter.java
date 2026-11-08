package java.io;

/**
 * GWT emulation of java.io.PrintWriter for Shattered Pixel Dungeon (GWT web
 * port). Used by com.watabou.noosa.Game.reportException() together with
 * StringWriter/Throwable.printStackTrace(PrintWriter). Like the real class,
 * all methods swallow IOExceptions.
 */
public class PrintWriter extends Writer {

	private final Writer out;

	public PrintWriter(Writer out) {
		this.out = out;
	}

	public PrintWriter(Writer out, boolean autoFlush) {
		this.out = out;
	}

	public void print(String s) {
		writeQuietly(s == null ? "null" : s);
	}

	public void print(Object obj) {
		print(String.valueOf(obj));
	}

	public void println(String s) {
		print(s);
		println();
	}

	public void println(Object obj) {
		print(obj);
		println();
	}

	public void println() {
		writeQuietly("\n");
	}

	@Override
	public void write(char[] buf, int offset, int count) {
		try {
			out.write(buf, offset, count);
		} catch (IOException e) {
			// swallowed, as in the real PrintWriter
		}
	}

	@Override
	public void write(String str) {
		writeQuietly(str);
	}

	@Override
	public void flush() {
		try {
			out.flush();
		} catch (IOException e) {
			// swallowed
		}
	}

	@Override
	public void close() {
		try {
			out.close();
		} catch (IOException e) {
			// swallowed
		}
	}

	private void writeQuietly(String s) {
		try {
			out.write(s);
		} catch (IOException e) {
			// swallowed
		}
	}
}
