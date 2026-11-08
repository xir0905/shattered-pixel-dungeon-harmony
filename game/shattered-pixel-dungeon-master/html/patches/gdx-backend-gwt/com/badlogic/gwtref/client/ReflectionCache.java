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

package com.badlogic.gwtref.client;

import com.google.gwt.core.client.GWT;

/** PATCHED for Shattered Pixel Dungeon: the reflection cache is split into
 * eight generator chunks instead of two, because the ~2300 reflectable game
 * types overflow the 65536 constant pool limit of a single generated class. */
public class ReflectionCache {
	private static IReflectionCache instance1 = GWT.create(IReflectionCache.class);
	private static IReflectionCache instance2 = GWT.create(IReflectionCache2.class);
	private static IReflectionCache instance3 = GWT.create(IReflectionCache3.class);
	private static IReflectionCache instance4 = GWT.create(IReflectionCache4.class);
	private static IReflectionCache instance5 = GWT.create(IReflectionCache5.class);
	private static IReflectionCache instance6 = GWT.create(IReflectionCache6.class);
	private static IReflectionCache instance7 = GWT.create(IReflectionCache7.class);
	private static IReflectionCache instance8 = GWT.create(IReflectionCache8.class);

	private static final IReflectionCache[] instances = {instance1, instance2, instance3, instance4,
		instance5, instance6, instance7, instance8};

	public static Type forName (String name) throws ClassNotFoundException {
		String lookup = convert(name);
		for (IReflectionCache cache : instances) {
			Type type = cache.forName(lookup);
			if (type != null) {
				type.source = cache;
				return type;
			}
		}
		throw new ClassNotFoundException("Couldn't find Type for class '" + name + "'");
	}

	public static Type getType (Class clazz) {
		if (clazz == null) return null;
		String lookup = convert(clazz.getName());
		for (IReflectionCache cache : instances) {
			Type type = cache.forName(lookup);
			if (type != null) {
				type.source = cache;
				return type;
			}
		}
		throw new RuntimeException("Couldn't find Type for class '" + clazz.getName() + "'");
	}

	private static String convert (String className) {
		if (className.startsWith("[")) {
			int dimensions = 0;
			char c = className.charAt(0);
			String suffix = "";
			while (c == '[') {
				dimensions++;
				suffix += "[]";
				c = className.charAt(dimensions);
			}
			char t = className.charAt(dimensions);
			switch (t) {
			case 'Z':
				return "boolean" + suffix;
			case 'B':
				return "byte" + suffix;
			case 'C':
				return "char" + suffix;
			case 'L':
				return className.substring(dimensions + 1, className.length() - 1).replace('$', '.') + suffix;
			case 'D':
				return "double" + suffix;
			case 'F':
				return "float" + suffix;
			case 'I':
				return "int" + suffix;
			case 'J':
				return "long" + suffix;
			case 'S':
				return "short" + suffix;
			default:
				throw new IllegalArgumentException("Couldn't transform '" + className + "' to qualified source name");
			}
		} else {
			return className.replace('$', '.');
		}
	}

	public static Object newArray (Class componentType, int size) {
		Type type = getType(componentType);
		return type.source.newArray(type, size);
	}

	public static Object getFieldValue (Field field, Object obj) throws IllegalAccessException {
		return field.getEnclosingType().source.get(field, obj);
	}

	public static void setFieldValue (Field field, Object obj, Object value) throws IllegalAccessException {
		field.getEnclosingType().source.set(field, obj, value);
	}

	public static Object invoke (Method method, Object obj, Object[] params) {
		return method.enclosingType.getType().source.invoke(method, obj, params);
	}

	public static int getArrayLength (Type type, Object obj) {
		return type.source.getArrayLength(type, obj);
	}

	public static Object getArrayElement (Type type, Object obj, int i) {
		return type.source.getArrayElement(type, obj, i);
	}

	public static void setArrayElement (Type type, Object obj, int i, Object value) {
		type.source.setArrayElement(type, obj, i, value);
	}
}
