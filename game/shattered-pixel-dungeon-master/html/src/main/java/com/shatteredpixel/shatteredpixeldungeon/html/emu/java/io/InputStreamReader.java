package java.io;

/**
 * GWT emulation of java.io.InputStreamReader for Shattered Pixel Dungeon (GWT
 * web port). Used by the game's text loading (messages/properties) and
 * org.json's JSONTokener(InputStream).
 *
 * GWT's UTF-8 charset decoder is STRICT: it throws
 * IndexOutOfBoundsException("Invalid UTF8 sequence") when a multi-byte
 * sequence is split across separate String constructions, so a naive
 * per-read-chunk decode breaks on any file containing multi-byte characters
 * (chunk boundaries land inside CJK sequences). Every GWT asset stream is an
 * in-memory byte array, so this emu drains the whole stream once, decodes it
 * as a single string, and serves characters from that string. If the bytes
 * are not valid UTF-8 at all, fall back to byte-per-char ISO-8859-1 decoding
 * instead of throwing (JVM-style leniency).
 */
public class InputStreamReader extends Reader {

	private final InputStream stream;
	private String decoded = "";
	private int pos = 0;
	private boolean initialized = false;

	public InputStreamReader(InputStream stream) {
		this.stream = stream;
	}

	public InputStreamReader(InputStream stream, String charsetName) throws UnsupportedEncodingException {
		if (charsetName == null
				|| !(charsetName.equalsIgnoreCase("UTF-8")
					|| charsetName.equalsIgnoreCase("UTF-16")
					|| charsetName.equalsIgnoreCase("US-ASCII")
					|| charsetName.equalsIgnoreCase("ISO-8859-1"))) {
			throw new UnsupportedEncodingException(charsetName);
		}
		this.stream = stream;
	}

	private void initialize() throws IOException {
		if (initialized) {
			return;
		}
		initialized = true;
		byte[] buffer = new byte[8192];
		byte[] all = new byte[8192];
		int total = 0;
		while (true) {
			int r = stream.read(buffer, 0, buffer.length);
			if (r <= 0) {
				break;
			}
			if (total + r > all.length) {
				byte[] grown = new byte[Math.max(all.length * 2, total + r)];
				System.arraycopy(all, 0, grown, 0, total);
				all = grown;
			}
			System.arraycopy(buffer, 0, all, total, r);
			total += r;
		}
		try {
			decoded = new String(all, 0, total);
		} catch (IndexOutOfBoundsException e) {
			decoded = decodeLatin1(all, total);
		}
	}

	private static String decodeLatin1(byte[] bytes, int len) {
		StringBuilder sb = new StringBuilder(len);
		for (int i = 0; i < len; i++) {
			sb.append((char) (bytes[i] & 0xFF));
		}
		return sb.toString();
	}

	@Override
	public int read(char[] buf, int offset, int count) throws IOException {
		initialize();
		if (pos >= decoded.length()) {
			return -1;
		}
		int n = Math.min(count, decoded.length() - pos);
		for (int i = 0; i < n; i++) {
			buf[offset + i] = decoded.charAt(pos + i);
		}
		pos += n;
		return n;
	}

	@Override
	public void close() throws IOException {
		stream.close();
	}
}
