package java.io;

/**
 * GWT emulation of java.io.StringWriter for Shattered Pixel Dungeon (GWT web
 * port). GWT's JRE emulation has no StringWriter, but org.json's
 * JSONObject/JSONArray toString()/write() paths are built on it, so this
 * implementation is backed by a real StringBuffer and is fully functional.
 */
public class StringWriter extends Writer {

	private final StringBuffer buffer = new StringBuffer();

	public StringWriter() {
	}

	public StringWriter(int initialSize) {
		// GWT emulation: capacity hint only; the StringBuffer grows on demand.
	}

	public StringBuffer getBuffer() {
		return buffer;
	}

	@Override
	public void close() {
	}

	@Override
	public void flush() {
	}

	@Override
	public void write(char[] buf, int offset, int count) {
		for (int i = 0; i < count; i++) {
			buffer.append(buf[offset + i]);
		}
	}

	@Override
	public void write(String str, int offset, int count) {
		buffer.append(str.substring(offset, offset + count));
	}

	@Override
	public String toString() {
		return buffer.toString();
	}
}
