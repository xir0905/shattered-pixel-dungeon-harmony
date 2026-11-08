package java.io;

/**
 * GWT emulation of java.io.BufferedReader for Shattered Pixel Dungeon (GWT web
 * port). GWT's JRE emulation has no BufferedReader; org.json's JSONTokener and
 * the game's Bundle.read() need it. Simple delegating implementation.
 */
public class BufferedReader extends Reader {

	private final Reader reader;

	public BufferedReader(Reader reader) {
		this.reader = reader;
	}

	public BufferedReader(Reader reader, int size) {
		this.reader = reader;
	}

	@Override
	public int read(char[] buf, int offset, int count) throws IOException {
		return reader.read(buf, offset, count);
	}

	public String readLine() throws IOException {
		StringBuilder line = new StringBuilder();
		int c = reader.read();
		while (c != -1 && c != '\n' && c != '\r') {
			line.append((char) c);
			c = reader.read();
		}
		if (c == '\r') {
			reader.read();
		}
		if (c == -1 && line.length() == 0) {
			return null;
		}
		return line.toString();
	}

	@Override
	public void mark(int readAheadLimit) throws IOException {
		reader.mark(readAheadLimit);
	}

	@Override
	public boolean markSupported() {
		return true;
	}

	@Override
	public void reset() throws IOException {
		reader.reset();
	}

	@Override
	public void close() throws IOException {
		reader.close();
	}
}
