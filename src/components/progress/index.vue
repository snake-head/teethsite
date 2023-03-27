<template>
    <div
        class="el-progress"
        :class="[
            `el-progress--${type}`,
            status ? `is-${status}` : '',
            {
                'el-progress--without-text': !showText,
                'el-progress--text-inside': textInside,
            },
        ]"
        role="progressbar"
        :aria-valuenow="percentage"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <div
            v-if="(showText || $slots.default) && !textInside"
            class="el-progress__text"
            :style="{
                fontSize: `${progressTextSize}px`,
                color: '#ebeef5',
                minWidth: '20px',
                marginLeft: '2px',
                marginRight: '2px',
            }"
        >
            <slot name="left-text">
                <span v-if="!status">{{ content.percentage1 }}</span>
                <i v-else :class="iconClass"></i>
            </slot>
        </div>
        <div v-if="type === 'line'" class="el-progress-bar">
            <div
                class="el-progress-bar__outer"
                :style="{ height: `${strokeWidth}px`, display: 'flex' }"
            >
                <div
                    class="el-progress-bar__outer"
                    :style="{
                        width: '50%',
                        height: '100%',
                        borderTopLeftRadius: '0px',
                        borderBottomLeftRadius: '0px',
                        transform: 'scaleX(-1)',
                        borderLeft: '1px solid #004184',
                    }"
                >
                    <div
                        :class="[
                            'el-progress-bar__inner',
                            {
                                'el-progress-bar__inner--indeterminate':
                                    indeterminate,
                            },
                        ]"
                        :style="barStyle1"
                    >
                        <div
                            v-if="(showText || $slots.default) && textInside"
                            class="el-progress-bar__innerText"
                            :style="{ transform: 'scaleX(-1)' }"
                        >
                            <slot v-bind="slotData">
                                <span>{{ content.percentage1 }}</span>
                            </slot>
                        </div>
                    </div>
                </div>
                <div
                    class="el-progress-bar__outer"
                    :style="{
                        width: '50%',
                        height: '100%',
                        borderTopLeftRadius: '0px',
                        borderBottomLeftRadius: '0px',
                        borderLeft: '1px solid #004184',
                    }"
                >
                    <div
                        :class="[
                            'el-progress-bar__inner',
                            {
                                'el-progress-bar__inner--indeterminate':
                                    indeterminate,
                            },
                        ]"
                        :style="barStyle2"
                    >
                        <div
                            v-if="(showText || $slots.default) && textInside"
                            class="el-progress-bar__innerText"
                        >
                            <slot v-bind="slotData">
                                <span>{{ content.percentage2 }}</span>
                            </slot>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div
            v-else
            class="el-progress-circle"
            :style="{ height: `${width}px`, width: `${width}px` }"
        >
            <svg viewBox="0 0 100 100">
                <path
                    class="el-progress-circle__track"
                    :d="trackPath"
                    stroke="#e5e9f2"
                    :stroke-width="relativeStrokeWidth"
                    fill="none"
                    :style="trailPathStyle"
                />
                <path
                    class="el-progress-circle__path"
                    :d="trackPath"
                    :stroke="stroke"
                    fill="none"
                    :stroke-linecap="strokeLinecap"
                    :stroke-width="percentage ? relativeStrokeWidth : 0"
                    :style="circlePathStyle"
                />
            </svg>
        </div>
        <div
            v-if="(showText || $slots.default) && !textInside"
            class="el-progress__text"
            :style="{
                fontSize: `${progressTextSize}px`,
                color: '#ebeef5',
                minWidth: '20px',
                marginLeft: '2px',
                marginRight: '2px',
            }"
        >
            <slot name="right-text">
                <span v-if="!status">{{ content.percentage2 }}</span>
                <i v-else :class="iconClass"></i>
            </slot>
        </div>
    </div>
</template>

<script>
import { computed } from "vue";

export default {
    name: "ElDualProgress",
    props: {
        type: {
            type: String,
            default: "line",
            validator: (val) =>
                ["line", "circle", "dashboard"].indexOf(val) > -1,
        },
        percentage: {
            type: Number,
            default: 0,
            required: false,
            validator: (val) => val >= 0 && val <= 100,
        },
        percentage1: {
            type: Number,
            default: 0,
            required: true,
            validator: (val) => val >= 0 && val <= 100,
        },
        percentage2: {
            type: Number,
            default: 0,
            required: true,
            validator: (val) => val >= 0 && val <= 100,
        },
        status: {
            type: String,
            default: "",
            validator: (val) =>
                ["", "success", "exception", "warning"].indexOf(val) > -1,
        },
        indeterminate: {
            type: Boolean,
            default: false,
        },
        duration: {
            type: Number,
            default: 0,
        },
        strokeWidth: {
            type: Number,
            default: 6,
        },
        strokeLinecap: {
            type: String,
            default: "round",
        },
        textInside: {
            type: Boolean,
            default: false,
        },
        width: {
            type: Number,
            default: 126,
        },
        showText: {
            type: Boolean,
            default: true,
        },
        color: {
            type: [String, Array, Function],
            default: "",
        },
        format: {
            type: Function,
            default: (percentage) => `${percentage}%`,
        },
        textSize: {
            type: String,
            default: "",
        },
    },
    setup(props) {
        const barStyle1 = computed(() => {
            return {
                width: `${props.percentage1}%`,
                animationDuration: `${props.duration}s`,
                backgroundColor: getCurrentColor(props.percentage1),
                borderTopLeftRadius: "0px",
                borderBottomLeftRadius: "0px",
            };
        });
        const barStyle2 = computed(() => {
            return {
                width: `${props.percentage2}%`,
                animationDuration: `${props.duration}s`,
                backgroundColor: getCurrentColor(props.percentage2),
                borderTopLeftRadius: "0px",
                borderBottomLeftRadius: "0px",
            };
        });

        const relativeStrokeWidth = computed(() => {
            return ((props.strokeWidth / props.width) * 100).toFixed(1);
        });

        const radius = computed(() => {
            if (props.type === "circle" || props.type === "dashboard") {
                return parseInt(
                    `${50 - parseFloat(relativeStrokeWidth.value) / 2}`,
                    10
                );
            } else {
                return 0;
            }
        });

        const trackPath = computed(() => {
            const r = radius.value;
            const isDashboard = props.type === "dashboard";
            return `
          M 50 50
          m 0 ${isDashboard ? "" : "-"}${r}
          a ${r} ${r} 0 1 1 0 ${isDashboard ? "-" : ""}${r * 2}
          a ${r} ${r} 0 1 1 0 ${isDashboard ? "" : "-"}${r * 2}
          `;
        });

        const perimeter = computed(() => {
            return 2 * Math.PI * radius.value;
        });

        const rate = computed(() => {
            return props.type === "dashboard" ? 0.75 : 1;
        });

        const strokeDashoffset = computed(() => {
            const offset = (-1 * perimeter.value * (1 - rate.value)) / 2;
            return `${offset}px`;
        });

        const trailPathStyle = computed(() => {
            return {
                strokeDasharray: `${perimeter.value * rate.value}px, ${
                    perimeter.value
                }px`,
                strokeDashoffset: strokeDashoffset.value,
            };
        });

        const circlePathStyle = computed(() => {
            return {
                strokeDasharray: `${
                    perimeter.value * rate.value * (props.percentage / 100)
                }px, ${perimeter.value}px`,
                strokeDashoffset: strokeDashoffset.value,
                transition: "stroke-dasharray 0.6s ease 0s, stroke 0.6s ease",
            };
        });

        const stroke = computed(() => {
            let ret;
            if (props.color) {
                ret = getCurrentColor(props.percentage);
            } else {
                switch (props.status) {
                    case "success":
                        ret = "#13ce66";
                        break;
                    case "exception":
                        ret = "#ff4949";
                        break;
                    case "warning":
                        ret = "#e6a23c";
                        break;
                    default:
                        ret = "#20a0ff";
                }
            }
            return ret;
        });

        const iconClass = computed(() => {
            if (props.status === "warning") {
                return "el-icon-warning";
            }
            if (props.type === "line") {
                return props.status === "success"
                    ? "el-icon-circle-check"
                    : "el-icon-circle-close";
            } else {
                return props.status === "success"
                    ? "el-icon-check"
                    : "el-icon-close";
            }
        });

        const progressTextSize = computed(() => {
            if (props.textSize !== "") {
                return props.textSize;
            }
            return props.type === "line"
                ? 12 + props.strokeWidth * 0.4
                : props.width * 0.111111 + 2;
        });

        const content = computed(() => {
            return {
                percentage1: props.format(props.percentage1),
                percentage2: props.format(props.percentage2),
            };
        });

        const getCurrentColor = (percentage) => {
            const { color } = props;
            if (typeof color === "function") {
                return color(percentage);
            } else if (typeof color === "string") {
                return color;
            } else {
                const span = 100 / color.length;
                const seriesColors = color.map((seriesColor, index) => {
                    if (typeof seriesColor === "string") {
                        return {
                            color: seriesColor,
                            percentage: (index + 1) * span,
                        };
                    }
                    return seriesColor;
                });
                const colorArray = seriesColors.sort(
                    (a, b) => a.percentage - b.percentage
                );

                for (let i = 0; i < colorArray.length; i++) {
                    if (colorArray[i].percentage > percentage) {
                        return colorArray[i].color;
                    }
                }
                return colorArray[colorArray.length - 1]?.color;
            }
        };

        const slotData = computed(() => {
            return {
                percentage: props.percentage,
            };
        });

        return {
            barStyle1,
            barStyle2,
            relativeStrokeWidth,
            radius,
            trackPath,
            perimeter,
            rate,
            strokeDashoffset,
            trailPathStyle,
            circlePathStyle,
            stroke,
            iconClass,
            progressTextSize,
            content,
            getCurrentColor,
            slotData,
        };
    },
};
</script>
