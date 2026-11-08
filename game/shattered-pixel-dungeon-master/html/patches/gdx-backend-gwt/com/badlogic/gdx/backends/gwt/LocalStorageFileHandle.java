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

package com.badlogic.gdx.backends.gwt;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.UnsupportedEncodingException;
import java.io.Writer;
import java.util.ArrayList;

import com.badlogic.gdx.Files.FileType;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.utils.GdxRuntimeException;
import com.google.gwt.storage.client.Storage;

/**
 * PATCHED for Shattered Pixel Dungeon (GWT web port): a localStorage-backed
 * FileHandle for FileType.Local, restoring the local file support that the
 * 1.14.0 GWT backend dropped (it only supports Internal/Classpath reads).
 *
 * Files are stored as UTF-8 strings under "gdxfile:&lt;path&gt;" localStorage
 * keys with a companion "gdxmtime:&lt;path&gt;" last-modified entry. Directories
 * exist implicitly whenever keys with a "&lt;path&gt;/" prefix exist, so the
 * root "" is always a directory. The game's saves, rankings, journal, badges
 * etc. are all JSON text written through com.watabou.utils.Bundle, so string
 * storage is lossless.
 */
public class LocalStorageFileHandle extends FileHandle {

	private static final String KEY_PREFIX = "gdxfile:";
	private static final String MTIME_PREFIX = "gdxmtime:";

	private final String path;

	public LocalStorageFileHandle (String path) {
		this.path = fixSlashes(path);
	}

	private static Storage storage () {
		return GwtFiles.LocalStorage;
	}

	private static String fixSlashes (String path) {
		if (path == null) return "";
		path = path.replace('\\', '/');
		if (path.endsWith("/")) {
			path = path.substring(0, path.length() - 1);
		}
		return path;
	}

	public String path () {
		return path;
	}

	public String name () {
		int index = path.lastIndexOf('/');
		if (index < 0) return path;
		return path.substring(index + 1);
	}

	public String extension () {
		String name = name();
		int dotIndex = name.lastIndexOf('.');
		if (dotIndex == -1) return "";
		return name.substring(dotIndex + 1);
	}

	public String nameWithoutExtension () {
		String name = name();
		int dotIndex = name.lastIndexOf('.');
		if (dotIndex == -1) return name;
		return name.substring(0, dotIndex);
	}

	public String pathWithoutExtension () {
		int dotIndex = path.lastIndexOf('.');
		if (dotIndex == -1) return path;
		return path.substring(0, dotIndex);
	}

	public FileType type () {
		return FileType.Local;
	}

	public File file () {
		throw new GdxRuntimeException("file() not supported for local files in GWT backend");
	}

	public boolean exists () {
		Storage s = storage();
		if (s == null) return false;
		if (s.getItem(KEY_PREFIX + path) != null) return true;
		return isDirectory();
	}

	public boolean isDirectory () {
		if (path.isEmpty()) return true;
		Storage s = storage();
		if (s == null) return false;
		if (s.getItem(KEY_PREFIX + path) != null) return false;
		String prefix = KEY_PREFIX + path + "/";
		for (int i = 0; i < s.getLength(); i++) {
			String key = s.key(i);
			if (key != null && key.startsWith(prefix)) return true;
		}
		return false;
	}

	public FileHandle[] list () {
		Storage s = storage();
		if (s == null || !isDirectory()) return new FileHandle[0];
		String prefix = path.isEmpty() ? KEY_PREFIX : KEY_PREFIX + path + "/";
		ArrayList<String> names = new ArrayList<String>();
		for (int i = 0; i < s.getLength(); i++) {
			String key = s.key(i);
			if (key == null || !key.startsWith(prefix)) continue;
			String rest = key.substring(prefix.length());
			if (rest.isEmpty()) continue;
			int slash = rest.indexOf('/');
			String name = slash >= 0 ? rest.substring(0, slash) : rest;
			if (!names.contains(name)) names.add(name);
		}
		FileHandle[] children = new FileHandle[names.size()];
		for (int i = 0; i < names.size(); i++) {
			children[i] = child(names.get(i));
		}
		return children;
	}

	public FileHandle[] list (String suffix) {
		FileHandle[] all = list();
		ArrayList<FileHandle> matching = new ArrayList<FileHandle>();
		for (FileHandle child : all) {
			if (child.name().endsWith(suffix)) matching.add(child);
		}
		return matching.toArray(new FileHandle[matching.size()]);
	}

	public FileHandle child (String name) {
		return new LocalStorageFileHandle(path.isEmpty() ? name : path + "/" + name);
	}

	public FileHandle parent () {
		int index = path.lastIndexOf('/');
		return new LocalStorageFileHandle(index <= 0 ? "" : path.substring(0, index));
	}

	public FileHandle sibling (String name) {
		return parent().child(name);
	}

	public void mkdirs () {
		//directories are implicit in the key-prefix scheme, nothing to create
	}

	public boolean delete () {
		Storage s = storage();
		if (s == null) return false;
		if (isDirectory()) return false;
		boolean existed = s.getItem(KEY_PREFIX + path) != null;
		s.removeItem(KEY_PREFIX + path);
		s.removeItem(MTIME_PREFIX + path);
		return existed;
	}

	public boolean deleteDirectory () {
		Storage s = storage();
		if (s == null) return false;
		ArrayList<String> doomed = collectSelfAndChildren(s);
		for (int i = 0; i < doomed.size(); i++) {
			s.removeItem(doomed.get(i));
		}
		return true;
	}

	public void emptyDirectory () {
		Storage s = storage();
		if (s == null) return;
		ArrayList<String> doomed = collectSelfAndChildren(s);
		for (int i = 0; i < doomed.size(); i++) {
			s.removeItem(doomed.get(i));
		}
	}

	public void emptyDirectory (boolean preserveTree) {
		emptyDirectory();
	}

	private ArrayList<String> collectSelfAndChildren (Storage s) {
		ArrayList<String> doomed = new ArrayList<String>();
		for (int i = 0; i < s.getLength(); i++) {
			String key = s.key(i);
			if (key == null) continue;
			String payload;
			if (key.startsWith(KEY_PREFIX)) {
				payload = key.substring(KEY_PREFIX.length());
			} else if (key.startsWith(MTIME_PREFIX)) {
				payload = key.substring(MTIME_PREFIX.length());
			} else {
				continue;
			}
			if (payload.equals(path) || (path.isEmpty() && !payload.isEmpty()) || payload.startsWith(path + "/")) {
				doomed.add(key);
			}
		}
		return doomed;
	}

	public void copyTo (FileHandle dest) {
		if (!(dest instanceof LocalStorageFileHandle)) {
			throw new GdxRuntimeException("copyTo target must be a local file: " + dest);
		}
		Storage s = storage();
		if (s == null) throw new GdxRuntimeException("localStorage unavailable");
		String content = s.getItem(KEY_PREFIX + path);
		((LocalStorageFileHandle)dest).store(content == null ? "" : content, false);
		String mtime = s.getItem(MTIME_PREFIX + path);
		if (mtime != null) s.setItem(MTIME_PREFIX + dest.path(), mtime);
	}

	public void moveTo (FileHandle dest) {
		if (dest.path().equals(path)) return;
		copyTo(dest);
		Storage s = storage();
		if (s == null) return;
		s.removeItem(KEY_PREFIX + path);
		s.removeItem(MTIME_PREFIX + path);
	}

	public long length () {
		Storage s = storage();
		if (s == null) return 0;
		String content = s.getItem(KEY_PREFIX + path);
		if (content == null) return 0;
		return content.length();
	}

	public long lastModified () {
		Storage s = storage();
		if (s == null) return 0;
		String mtime = s.getItem(MTIME_PREFIX + path);
		if (mtime == null) return 0;
		try {
			return Long.parseLong(mtime);
		} catch (NumberFormatException e) {
			return 0;
		}
	}

	private void store (String content, boolean append) {
		Storage s = storage();
		if (s == null) throw new GdxRuntimeException("localStorage unavailable, cannot write " + path);
		if (append) {
			String existing = s.getItem(KEY_PREFIX + path);
			content = (existing == null ? "" : existing) + content;
		}
		s.setItem(KEY_PREFIX + path, content);
		s.setItem(MTIME_PREFIX + path, String.valueOf(System.currentTimeMillis()));
	}

	/* reading */

	public InputStream read () {
		Storage s = storage();
		String content = s == null ? null : s.getItem(KEY_PREFIX + path);
		if (content == null) throw new GdxRuntimeException(path + " does not exist");
		return new ByteArrayInputStream(getUtf8Bytes(content));
	}

	public BufferedInputStream read (int bufferSize) {
		return new BufferedInputStream(read(), bufferSize);
	}

	public Reader reader () {
		return new InputStreamReader(read());
	}

	public Reader reader (String charset) {
		try {
			return new InputStreamReader(read(), charset);
		} catch (UnsupportedEncodingException e) {
			throw new GdxRuntimeException("Encoding '" + charset + "' not supported", e);
		}
	}

	public BufferedReader reader (int bufferSize) {
		return new BufferedReader(reader(), bufferSize);
	}

	public BufferedReader reader (int bufferSize, String charset) {
		return new BufferedReader(reader(charset), bufferSize);
	}

	public String readString () {
		Storage s = storage();
		String content = s == null ? null : s.getItem(KEY_PREFIX + path);
		if (content == null) throw new GdxRuntimeException(path + " does not exist");
		return content;
	}

	public String readString (String charset) {
		return readString();
	}

	public byte[] readBytes () {
		return getUtf8Bytes(readString());
	}

	public int readBytes (byte[] bytes, int offset, int size) {
		byte[] data = readBytes();
		int n = Math.min(size, data.length);
		System.arraycopy(data, 0, bytes, offset, n);
		return n;
	}

	public java.nio.ByteBuffer map () {
		throw new GdxRuntimeException("Cannot map files in GWT backend");
	}

	public java.nio.ByteBuffer map (java.nio.channels.FileChannel.MapMode mode) {
		throw new GdxRuntimeException("Cannot map files in GWT backend");
	}

	/* writing */

	public OutputStream write (boolean append) {
		return new LocalStorageOutputStream(append);
	}

	public void write (InputStream input, boolean append) {
		ByteArrayOutputStream buffer = new ByteArrayOutputStream();
		byte[] chunk = new byte[4096];
		try {
			while (true) {
				int r = input.read(chunk);
				if (r <= 0) break;
				buffer.write(chunk, 0, r);
			}
		} catch (IOException e) {
			throw new GdxRuntimeException("Error reading stream for " + path, e);
		}
		byte[] bytes = buffer.toByteArray();
		store(new String(bytes, 0, bytes.length), append);
	}

	public Writer writer (boolean append) {
		return writer(append, null);
	}

	public Writer writer (boolean append, String charset) {
		//the emulated OutputStreamWriter never throws UnsupportedEncodingException
		return new OutputStreamWriter(write(append), charset);
	}

	public void writeString (String string, boolean append) {
		store(string, append);
	}

	public void writeString (String string, boolean append, String charset) {
		if (charset != null && !charset.equalsIgnoreCase("UTF-8")) {
			throw new GdxRuntimeException("Only UTF-8 supported for local files, got '" + charset + "'");
		}
		store(string, append);
	}

	public void writeBytes (byte[] bytes, boolean append) {
		writeBytes(bytes, 0, bytes.length, append);
	}

	public void writeBytes (byte[] bytes, int offset, int length, boolean append) {
		store(new String(bytes, offset, length), append);
	}

	public String toString () {
		return path;
	}

	private static byte[] getUtf8Bytes (String content) {
		try {
			return content.getBytes("UTF-8");
		} catch (UnsupportedEncodingException e) {
			throw new GdxRuntimeException("UTF-8 not supported", e);
		}
	}

	/** Accumulates written bytes and persists the decoded UTF-8 string to
	 * localStorage when closed. */
	private class LocalStorageOutputStream extends OutputStream {

		private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
		private final boolean append;
		private boolean closed = false;

		LocalStorageOutputStream (boolean append) {
			this.append = append;
		}

		@Override
		public void write (int b) {
			if (closed) throw new GdxRuntimeException("Stream closed: " + path);
			buffer.write(b);
		}

		@Override
		public void write (byte[] b, int off, int len) {
			if (closed) throw new GdxRuntimeException("Stream closed: " + path);
			buffer.write(b, off, len);
		}

		@Override
		public void flush () {
			//nothing to flush, persisted on close
		}

		@Override
		public void close () {
			if (closed) return;
			closed = true;
			byte[] bytes = buffer.toByteArray();
			store(new String(bytes, 0, bytes.length), append);
		}
	}
}
