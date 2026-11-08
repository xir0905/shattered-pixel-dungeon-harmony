package java.util;

/**
 * Placeholder ResourceBundle for the GWT web port of Shattered Pixel Dungeon.
 * org.json's JSONObject(String baseName, Locale) constructor references it;
 * the game never calls that constructor, so the stub only needs to compile.
 */
public class ResourceBundle {

	public static ResourceBundle getBundle(String baseName, Locale locale,
			ClassLoader loader) {
		return new ResourceBundle();
	}

	public Enumeration<String> getKeys() {
		return null;
	}

	public String getString(String key) {
		return null;
	}
}
