package java.lang.reflect;

/**
 * Placeholder reflection Field for the GWT web port of Shattered Pixel
 * Dungeon. GWT does not support reflective field introspection; org.json
 * references this API in field-name queries that the game never executes
 * (Class.getFields() always returns an empty array).
 */
public class Field {

	public String getName() {
		return "";
	}

	public int getModifiers() {
		return 0;
	}

	public Object get(Object obj) {
		return null;
	}
}
