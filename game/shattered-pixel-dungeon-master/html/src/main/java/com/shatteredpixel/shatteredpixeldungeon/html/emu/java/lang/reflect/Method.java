package java.lang.reflect;

/**
 * Placeholder reflection Method for the GWT web port of Shattered Pixel
 * Dungeon. GWT does not support reflective method introspection; org.json
 * references this API in bean-population code paths that the game never
 * executes (Class.getMethods() always returns an empty array).
 */
public class Method {

	public String getName() {
		return "";
	}

	public int getModifiers() {
		return 0;
	}

	public Class<?>[] getParameterTypes() {
		return new Class<?>[0];
	}

	public Object invoke(Object obj, Object... args) {
		return null;
	}
}
