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

package java.util.zip;

import java.io.IOException;
import java.io.InputStream;

/**
 * PATCHED for Shattered Pixel Dungeon (GWT web port): raw passthrough
 * emulation instead of the dummy implementation that throws on read.
 *
 * The game never receives gzip data in the web build (web saves are written
 * uncompressed), so no actual inflation is performed: all reads are delegated
 * to the underlying stream. Bundle.read() only wraps the stream in a
 * GZIPInputStream when it detects a 0x1f8b header, which never happens for
 * data written by the patched GZIPOutputStream below.
 */
public class InflaterInputStream extends InputStream {

	protected InputStream in;

	public InflaterInputStream(InputStream in) {
		this.in = in;
	}

	public InflaterInputStream(InputStream in, int size) {
		this.in = in;
	}

	@Override
	public int read() throws IOException {
		return in.read();
	}

	@Override
	public int read(byte[] b, int off, int len) throws IOException {
		return in.read(b, off, len);
	}

	@Override
	public int available() throws IOException {
		return in.available();
	}

	@Override
	public void close() throws IOException {
		in.close();
	}
}
