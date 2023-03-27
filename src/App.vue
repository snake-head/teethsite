<script setup>
// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import "@kitware/vtk.js/Rendering/Profiles/Geometry"; // geometry 渲染必须引入
import "@kitware/vtk.js/Rendering/Profiles/Volume"; // 3D volume 渲染必须引入
import "@kitware/vtk.js/Rendering/Profiles/Glyph"; // crop等工具 渲染必须引入
</script>

<template>
	<router-view></router-view>
</template>

<style>
* {
	margin: 0;
	padding: 0;
}
html,
body {
	width: 100%;
	height: 100%;
}
#app {
	width: 100%;
	height: 100%;
}
</style>
