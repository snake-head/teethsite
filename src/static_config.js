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
        // "bracketType": "f0ef5407e52b4fdd85c093a8d237ff32",
        "bracketType": "8d04e6f479e9464298f1751ff7aea09e", //用古邵今的托槽做测试
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
export const presetArrangeDataList = [
    {
        presetName: '弓形-尖I型',
        number: 0,
        upper: {
            dentalArchSettings: {
                W: 67.13397979736328,
                zLevelOfArch: -0.12285935688013527,
                axisCoord: 0,
                coEfficients: [
                    [50.966327183591275],
                    [0],
                    [-0.023582632583738494],
                    [0],
                    [-0.00002503109902617074]
                ]
            },
        },
        lower: {
            dentalArchSettings: {
                W: 65.30104446411133,
                zLevelOfArch: -0.12586569165108075,
                axisCoord: 0,
                coEfficients: [
                  [47.934799639252816],
                  [0],
                  [-0.03727883569606916],
                  [0],
                  [-0.000016704483441518135]
                ]
              },
        }
    },
    {
        presetName: '弓形-方0型',
        number: 1,
        upper: {
            dentalArchSettings: {
                W: 67.13397979736328,
                zLevelOfArch: -0.12285935688013527,
                axisCoord: 0,
                coEfficients: [
                  [44.225942671045104],
                  [0],
                  [-0.008568346363560742],
                  [0],
                  [-0.000026086433026133973]
                ]
            },
        },
        lower: {
            dentalArchSettings: {
                W: 65.30104446411133,
                zLevelOfArch: -0.12586569165108075,
                axisCoord: 0,
                coEfficients: [
                  [40.695425220763504],
                  [0],
                  [-0.007550063785935923],
                  [0],
                  [-0.00004488123873411915]
                ]
              },
        }
    },
    {
        presetName: '弓形-方I型',
        number: 2,
        upper: {
            dentalArchSettings: {
                W: 67.13397979736328,
                zLevelOfArch: -0.12285935688013527,
                axisCoord: 0,
                coEfficients: [
                  [48.91381672567031],
                  [0],
                  [-0.010313676396664029],
                  [0],
                  [-0.000026494910333856427]
                ]
              },
        },
        lower: {
            dentalArchSettings: {
                W: 65.30104446411133,
                zLevelOfArch: -0.12586569165108075,
                axisCoord: 0,
                coEfficients: [
                  [40.27422221852687],
                  [0],
                  [-0.005982394644394762],
                  [0],
                  [-0.00004255276948848992]
                ]
              },
        }
    },
    {
        presetName: '弓形-卵0型',
        number: 3,
        upper: {
            dentalArchSettings: {
                W: 67.13397979736328,
                zLevelOfArch: -0.12285935688013527,
                axisCoord: 0,
                coEfficients: [
                  [44.567684544873316],
                  [0],
                  [-0.015549079148918343],
                  [0],
                  [-0.000022940611096055046]
                ]
              },
        },
        lower: {
            dentalArchSettings: {
                W: 65.30104446411133,
                zLevelOfArch: -0.12586569165108075,
                axisCoord: 0,
                coEfficients: [
                  [39.48132335667847],
                  [0],
                  [-0.018982809146098734],
                  [0],
                  [-0.00002315148745058468]
                ]
              } ,
        }
    },
    {
        presetName: '弓形-卵I型',
        number: 4,
        upper: {
            dentalArchSettings: {
                W: 67.13397979736328,
                zLevelOfArch: -0.12285935688013527,
                axisCoord: 0,
                coEfficients: [
                  [51.6735731073273],
                  [0],
                  [-0.01778468077345252],
                  [0],
                  [-0.0000311593818099979]
                ]
              },
        },
        lower: {
            dentalArchSettings: {
                W: 65.30104446411133,
                zLevelOfArch: -0.12586569165108075,
                axisCoord: 0,
                coEfficients: [
                  [45.209127477165346],
                  [0],
                  [-0.01705421658131423],
                  [0],
                  [-0.0000453495271163693]
                ]
              },
        }
    },
]