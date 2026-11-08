package java.lang.reflect;

/**
 * Placeholder reflection Modifier for the GWT web port of Shattered Pixel
 * Dungeon. GWT does not support reflective modifiers; org.json references
 * Modifier.isPublic() in bean-population code that the game never executes.
 */
public class Modifier {

	public static boolean isPublic(int mod) {
		return false;
	}

	public static boolean isStatic(int mod) {
		return false;
	}

	public static boolean isTransient(int mod) {
		return false;
	}

	public static boolean isFinal(int mod) {
		return false;
	}
}
