<template>
	<div
		class="loading"
		:class="{
			hide: isFinish,
		}"
	>
		<div class="element-body">
			<div class="element a" />
			<div class="element b" />
			<div class="element c" />
			<div class="element d" />
			<div class="element e" />
			<div class="element f" />
			<div class="element g" />
			<div class="element h" />
			<div class="element i" />
			<div class="element j" />
			<div class="element k" />
			<div class="element l" />
		</div>
		<div class="msg">
			正在计算上下<br>
			颌牙重叠部分
		</div>
	</div>
</template>

<script setup>
import { computed, defineProps } from "vue";
const props = defineProps({
	isFinish: {
		type: Boolean,
		default: true
	}
});
</script>

<style scoped>
.loading {
	background: rgb(0, 0, 0, 0);
	width: 30%;
	height: 20%;
	position: absolute;
	bottom: 0;
	right: 0;
	z-index: 1000;
}
.loading.hide {
	display: none;
}

.element-body {
	position: relative;
	top: 28%;
	left: 25%;
	width: 78px;
	height: 78px;
	margin-left: 1px;
	margin-top: 1px;
}

@keyframes shcl_bounce {
	0% {
		transform: scale(1);
	}
	80% {
		transform: scale(0.3);
	}
	100% {
		transform: scale(1);
	}
}
@keyframes shcl_bounce_w {
	0% {
		transform: scale(0.3);
	}
	100% {
		transform: scale(0.3);
	}
}

.element {
	position: absolute;
	width: 15px;
	height: 15px;
	background: #dbe48f;
	border-radius: 8px;
	animation-name: shcl_bounce;
	animation-duration: 1s;
	animation-iteration-count: infinite;
	animation-direction: normal;
}
.element.a {
	left: 32px;
	top: 0px;
}
.element.b {
	left: 48px;
	top: 4px;
	animation-delay: 0.0833333s;
}
.element.c {
	left: 60px;
	top: 16px;
	animation-delay: 0.166667s;
}
.element.d {
	left: 64px;
	top: 32px;
	animation-delay: 0.25s;
}
.element.e {
	left: 60px;
	top: 48px;
	animation-delay: 0.333333s;
}
.element.f {
	left: 48px;
	top: 60px;
	animation-delay: 0.416667s;
}
.element.g {
	left: 32px;
	top: 64px;
	animation-delay: 0.5s;
}
.element.h {
	left: 16px;
	top: 60px;
	animation-delay: 0.583333s;
}
.element.i {
	left: 4px;
	top: 48px;
	animation-delay: 0.666667s;
}
.element.j {
	left: 0px;
	top: 32px;
	animation-delay: 0.75s;
}
.element.k {
	left: 4px;
	top: 16px;
	animation-delay: 0.833333s;
}
.element.l {
	left: 16px;
	top: 4px;
	animation-delay: 0.916667s;
}
.element-bar {
	position: absolute;
	width: 79px;
	height: 19px;
	left: 0;
	top: 30px;
	text-align: center;
	color: #d9edf7;
	font-weight: 600;
	font-size: 15px;
}

.element-bar.error {
	color: #993333;
}

.msg {
	position: absolute;
	top: 40%;
	left: 22%;
	text-align: center;
	color: #381c05;
	font-weight: 600;
}
.msg.hide {
	visibility: hidden;
}
.msg.error {
	color: #993333;
}
.msg.success {
	color: #31ca31;
}
.msg.deactive {
	color: rgba(104, 102, 102, 0.7);
}

.loading.error .element-body .element-bar {
	color: #993333;
}
.loading.warning .element {
	background: #993333;
	animation-name: shcl_bounce_w;
}
</style>
