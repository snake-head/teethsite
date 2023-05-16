export const DEFAULT_PATIENTUID = "??????";

/**
 *
 * http://localhost:4000/teethsite2.0/#/Viewer?patientUID=654d72dd-a34b-4ef8-8c3f-375e20850a2d
 * http://localhost:4000/teethsite2.0/#/Viewer?patientUID=46d385a8-3d1d-41c7-b7ed-4fe62b0c1329(测试用例,上下颌牙,无全景图,可做上传测试)
 * http://localhost:4000/teethsite2.0/#/Viewer?patientUID=d59aa583-6c3d-4d7f-9654-992a556b1c50(有全景图,无下颌牙)
 *
 * http://172.16.112.101:5066/testLogin/
 * http://172.16.112.101:5066/teeth3d/#/Viewer?patientUID=654d72dd-a34b-4ef8-8c3f-375e20850a2d
 * http://172.16.112.101:5066/teeth3d/#/Viewer?patientUID=46d385a8-3d1d-41c7-b7ed-4fe62b0c1329
 * http://172.16.112.101:5066/teeth3d/#/Viewer?patientUID=d59aa583-6c3d-4d7f-9654-992a556b1c50
 *
 */

// 托槽微调表格
export const bracketNameList = [
    "UL1",
    "UR1",
    "LL1",
    "LR1",
    "UL2",
    "UR2",
    "LL2",
    "LR2",
    "UL3",
    "UR3",
    "LL3",
    "LR3",
    "UL4",
    "UR4",
    "LL4",
    "LR4",
    "UL5",
    "UR5",
    "LL5",
    "LR5",
    "UL6",
    "UR6",
    "LL6",
    "LR6",
    "UL7",
    "UR7",
    "LL7",
    "LR7",
];
// 托槽数据中每个28个托槽的顺序
export const bracketDataNameOrderList = [
    "LL1",
    "LR1",
    "UL1",
    "UR1",
    "LL2",
    "LR2",
    "UL2",
    "UR2",
    "LL3",
    "LR3",
    "UL3",
    "UR3",
    "LL4",
    "LR4",
    "UL4",
    "UR4",
    "LL5",
    "LR5",
    "UL5",
    "UR5",
    "LL6",
    "LR6",
    "UL6",
    "UR6",
    "LL7",
    "LR7",
    "UL7",
    "UR7",
];
export const typedBracketNameList = {
    upper: [
        "UL1",
        "UR1",
        "UL2",
        "UR2",
        "UL3",
        "UR3",
        "UL4",
        "UR4",
        "UL5",
        "UR5",
        "UL6",
        "UR6",
        "UL7",
        "UR7",
    ],
    lower: [
        "LL1",
        "LR1",
        "LL2",
        "LR2",
        "LL3",
        "LR3",
        "LL4",
        "LR4",
        "LL5",
        "LR5",
        "LL6",
        "LR6",
        "LL7",
        "LR7",
    ],
};
// 转矩文件
export const rotateConfigList = [
    {
        "bracketName": "日盛标准系列自锁-标准转矩",
        "bracketType": "8d5c61c950ba484d9331c3a4c517af84",
        // "bracketType": "8d04e6f479e9464298f1751ff7aea09e", //用古邵今的托槽做测试
        "upper": [
            {"name": "UL1", "rotate": 17},
            {"name": "UR1", "rotate": 17},
            {"name": "UL2", "rotate": 6},
            {"name": "UR2", "rotate": 6},
            {"name": "UL3", "rotate": 6},
            {"name": "UR3", "rotate": 6},
            {"name": "UL4", "rotate": -11},
            {"name": "UR4", "rotate": -11},
            {"name": "UL5", "rotate": -11},
            {"name": "UR5", "rotate": -11},
            {"name": "UL6", "rotate": -14},
            {"name": "UR6", "rotate": -14},
            {"name": "UL7", "rotate": -14},
            {"name": "UR7", "rotate": -14}
        ],
        "lower": [
            {"name": "LL1", "rotate": -3},
            {"name": "LR1", "rotate": -3},
            {"name": "LL2", "rotate": -3},
            {"name": "LR2", "rotate": -3},
            {"name": "LL3", "rotate": 7},
            {"name": "LR3", "rotate": 7},
            {"name": "LL4", "rotate": -12},
            {"name": "LR4", "rotate": -12},
            {"name":"LL5","rotate": -17},
            {"name":"LR5","rotate": -17},
            {"name":"LL6","rotate": -20},
            {"name":"LR6","rotate": -20},
            {"name":"LL7","rotate": -15},
            {"name":"LR7","rotate": -15}
        ]
    }
]