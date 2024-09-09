// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkOBBTree from '@kitware/vtk.js/Filters/General/OBBTree'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkTriangleFilter from '@kitware/vtk.js/Filters/General/TriangleFilter';
import vtkTubeFilter from '@kitware/vtk.js/Filters/General/TubeFilter';
import vtkArrowSource from "@kitware/vtk.js/Filters/Sources/ArrowSource"

/**
 * @description 为mesh生成actor
 * @param {*} mesh 
 * @param {*} userMatrix 
 * @returns actor
 */
function render(mesh, userMatrix = null) {
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(mesh);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    if (userMatrix) {
      actor.setUserMatrix(userMatrix);
    }
  
    return actor;
  }


/**
 * @description 生成obb
 * @param {*} mesh 
 * @param {*} userMatrix 
 * @param {*} triangulate 
 * @returns {obbTree, obbActor}
 */
function addMesh(mesh, userMatrix, triangulate = false) {
  const obbTree = vtkOBBTree.newInstance({
    level:1,
    numberOfCellsPerNode: 4,
  });
  if (triangulate) {
    const triangleFilter = vtkTriangleFilter.newInstance();
    triangleFilter.setInputData(mesh);
    triangleFilter.update();
    obbTree.setDataset(triangleFilter.getOutputData());
  } else {
    obbTree.setDataset(mesh);
  }
  obbTree.buildLocator();
  // render(mesh, userMatrix);

  const obb = obbTree.generateRepresentation(4);
  const obbPolyData = {};
  obbPolyData.pointsData =  obb.getPoints().getData()
  obbPolyData.polysData =  obb.getPolys().getData()
  // const obbActor = render(obb, userMatrix);
  // obbActor.getProperty().setOpacity(0.3);
  // obbActor.getProperty().setEdgeVisibility(1);

  return {obbTree, obbPolyData};
}

/**
 * @description 计算两个mesh的交线
 * @param {*} mesh1 
 * @param {*} mesh2 
 * @param {*} triangulate 
 */
  function OBBTreeIntersect(mesh1, mesh2, triangulate = false) {
    console.time('计算OBBTree1耗时')
    const {obbTree:obbTree1, obbPolyData:obbPolyData1} = addMesh(mesh1, null, triangulate);
    console.timeEnd('计算OBBTree1耗时') // 1.6s
    console.time('计算OBBTree2耗时')
    const {obbTree:obbTree2, obbPolyData:obbPolyData2} = addMesh(mesh2, null, triangulate);
    console.timeEnd('计算OBBTree2耗时') // 1.6s
    const intersection = {
      obbTree1: obbTree2,
      intersectionLines: vtkPolyData.newInstance(),
    };
    console.time('计算交线耗时')
    const intersect = obbTree1.intersectWithOBBTree(
      obbTree2,
      null,
      obbTree1.findTriangleIntersections.bind(null, intersection)
    );
    console.timeEnd('计算交线耗时') // 15s
    console.log('obbs are intersected : ', intersect);
    const intersectionPolyData = {}
    intersectionPolyData.pointsData = intersection.intersectionLines.getPoints().getData();
    intersectionPolyData.linesData = intersection.intersectionLines.getLines().getData();
    // console.log(intersection.intersectionLines.getPoints().getData())
    // console.log(intersection.intersectionLines.getLines().getData())

    // const tubeFilter = vtkTubeFilter.newInstance();
    // tubeFilter.setInputData(intersection.intersectionLines);
    // tubeFilter.setRadius(0.01);
    // tubeFilter.update();
    // const intersectionActor = render(tubeFilter.getOutputData());
    // intersectionActor.getProperty().setColor(1, 0, 0);
    // intersectionActor.getMapper().setResolveCoincidentTopologyToPolygonOffset();
    // intersectionActor
    //   .getMapper()
    //   .setResolveCoincidentTopologyLineOffsetParameters(-1, -1);
    
    return {intersectionPolyData, obbPolyData1, obbPolyData2}
  }

self.onmessage = function(event){
    const {postUpperTeethPolyData, postLowerTeethPolyData} = event.data;
    const upperTeethPolyData = vtkPolyData.newInstance();
    upperTeethPolyData.getPoints().setData(postUpperTeethPolyData.pointsData);
    upperTeethPolyData.getPolys().setData(postUpperTeethPolyData.polysData);
    const lowerTeethPolyData = vtkPolyData.newInstance();
    lowerTeethPolyData.getPoints().setData(postLowerTeethPolyData.pointsData);
    lowerTeethPolyData.getPolys().setData(postLowerTeethPolyData.polysData);
    // const source1 = vtkArrowSource.newInstance({ direction: [1, 0, 0] });
    // source1.update();
    // const source2 = vtkArrowSource.newInstance({ direction: [0, 1, 1] });
    // source2.update();
    const {
      intersectionPolyData:postIntersectionPolyData, 
      obbPolyData1:postObbPolyData1, 
      obbPolyData2:postObbPolyData2} = OBBTreeIntersect(upperTeethPolyData, lowerTeethPolyData)
    // const {intersectionPolyData, obbPolyData1, obbPolyData2} = OBBTreeIntersect(source1.getOutputData(), source2.getOutputData(), true)
    self.postMessage({postIntersectionPolyData, postObbPolyData1, postObbPolyData2})
}