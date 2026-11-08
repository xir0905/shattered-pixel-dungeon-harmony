package java.util.zip;

import java.io.IOException;
import java.io.OutputStream;

/**
 * GWT emulation of java.util.zip.GZIPOutputStream for Shattered Pixel
 * Dungeon: a raw passthrough. The web build cannot compress, so save data is
 * written uncompressed (Bundle.read detects the missing gzip header and never
 * wraps the stream in the patched GZIPInputStream).
 */
public class GZIPOutputStream extends OutputStream {

	private final OutputStream out;

	public GZIPOutputStream(OutputStream out, int size) {
		this.out = out;
	}

	public GZIPOutputStream(OutputStream out) {
		this(out, 512);
	}

	@Override
	public void write(int b) throws IOException {
		out.write(b);
	}

	@Override
	public void write(byte[] b) throws IOException {
		out.write(b);
	}

	@Override
	public void write(byte[] b, int off, int len) throws IOException {
		out.write(b, off, len);
	}

	@Override
	public void flush() throws IOException {
		out.flush();
	}

	@Override
	public void close() throws IOException {
		out.close();
	}
}
