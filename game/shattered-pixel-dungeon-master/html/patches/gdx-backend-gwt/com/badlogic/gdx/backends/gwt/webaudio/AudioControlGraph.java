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
 *
 * HarmonyOS platform patch (SPD html/patches overlay, gdx-backend-gwt 1.14.0):
 *
 * SFX VOLUME. The stock graph is  source -> StereoPannerNode -> GainNode ->
 * destination. A StereoPannerNode at pan 0 uses EQUAL-POWER panning, so a mono
 * input (every SPD sound effect) is scaled to cos(pi/4) = 0.707 (-3dB) on each
 * output channel. Android's SoundPool instead copies a mono sample to both
 * channels at the full amplitude, so in this ArkWeb port every sound effect was
 * ~3dB quieter than the Android build while stereo music (a passthrough at pan
 * 0) was unaffected -- heard as "SFX too quiet / muffled relative to Android".
 *
 * SPD never pans sound effects or music (Sample.play computes pan as
 * rightVolume - leftVolume, and every call site passes equal left/right
 * volumes), so the panner is dead weight that only costs 3dB. Skip it and
 * connect the source straight to the gain node, matching Android's amplitude.
 * setSource/setPan already handle a null panNode, so the rest is unchanged.
 ******************************************************************************/

package com.badlogic.gdx.backends.gwt.webaudio;

import com.google.gwt.core.client.JavaScriptObject;

public class AudioControlGraph {
	private final JavaScriptObject audioContext;
	private JavaScriptObject destinationNode;

	private JavaScriptObject gainNode;
	private JavaScriptObject panNode;

	public AudioControlGraph (JavaScriptObject audioContext, JavaScriptObject destinationNode) {
		this.audioContext = audioContext;
		this.destinationNode = destinationNode;

		setupAudoGraph();
	}

	public native JavaScriptObject setupAudoGraph () /*-{
		// Get the Java values here, for readability
		var audioContext = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::audioContext;

		// Shader patched for ArkWeb: do not create a StereoPannerNode. See the
		// file header -- equal-power center panning would attenuate every mono
		// sound effect by 3dB versus Android. SPD never pans SFX/music, so we
		// wire the source directly into the gain node instead.
		this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::panNode = null;

		// Setup a volume node for the sound. Enables volume change during playback.
		var gainNode = null;
		if (audioContext.createGain)
			// Standard compliant
			gainNode = audioContext.createGain();
		else
			// Old WebKit/iOS
			gainNode = audioContext.createGainNode();
		this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::gainNode = gainNode;
		gainNode.gain.value = 1;

		gainNode
				.connect(this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::destinationNode);

	}-*/;

	public native JavaScriptObject setSourceJSNI (JavaScriptObject sourceNode) /*-{
		var gainNode = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::gainNode;
		var panNode = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::panNode;

		// Setup the audio graph, based on the supported features
		if (panNode) {
			sourceNode.connect(panNode);
		} else {
			sourceNode.connect(gainNode);
		}
	}-*/;

	public void setVolume (float volume) {
		setVolumeJSNI(volume);
	}

	public float getVolume () {
		return getVolumeJSNI();
	}

	public native JavaScriptObject setVolumeJSNI (float volume) /*-{
		var gainNode = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::gainNode;
		gainNode.gain.value = volume;
	}-*/;

	public native float getVolumeJSNI () /*-{
		var gainNode = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::gainNode;
		return gainNode.gain.value;
	}-*/;

	public void setPan (float pan) {
		setPanJSNI(pan);
	}

	public float getPan () {
		return getPanJSNI();
	}

	public native JavaScriptObject setPanJSNI (float pan) /*-{
		var panNode = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::panNode;
		if (panNode)
			panNode.pan.value = pan;
	}-*/;

	public native float getPanJSNI () /*-{
		var panNode = this.@com.badlogic.gdx.backends.gwt.webaudio.AudioControlGraph::panNode;
		if (panNode)
			return panNode.pan.value;
		return 0;
	}-*/;

	public void setSource (JavaScriptObject sourceNode) {
		setSourceJSNI(sourceNode);
	}
}
