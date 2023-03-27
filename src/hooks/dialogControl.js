import { computed, reactive } from "vue";
export default function() {
    let dialogShowState = reactive({
        showConfirmDialog: true,
    });
    let isAnyDialogShowing = computed(() =>
        Object.values(dialogShowState).some((isShow) => isShow === true)
    );

    function changeDialogShowState(dialogType, val) {
        if (dialogType === "all") {
            Object.keys(dialogShowState).forEach((k) => {
                dialogShowState[k] = val;
            });
        } else {
            dialogShowState[dialogType] = val;
        }
    }

    return {
        dialogShowState,
        isAnyDialogShowing,
        changeDialogShowState,
    };
}
