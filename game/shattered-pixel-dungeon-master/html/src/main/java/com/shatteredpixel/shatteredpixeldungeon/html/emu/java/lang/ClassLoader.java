package java.lang;

/**
 * Placeholder class loader for the GWT web port of Shattered Pixel Dungeon.
 * GWT has no class loaders; Thread.getContextClassLoader() returns null and
 * org.json's ResourceBundle constructor accepts it without using it.
 */
public class ClassLoader {
}
