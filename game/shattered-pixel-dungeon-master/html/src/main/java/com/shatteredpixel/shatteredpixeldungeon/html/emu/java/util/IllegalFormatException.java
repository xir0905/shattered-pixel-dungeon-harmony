package java.util;

/**
 * GWT's JRE emulation does not include java.util.IllegalFormatException, but
 * Shattered Pixel Dungeon catches it around String.format (Messages.format).
 */
public class IllegalFormatException extends IllegalArgumentException {

	public IllegalFormatException() {
		super();
	}
}
