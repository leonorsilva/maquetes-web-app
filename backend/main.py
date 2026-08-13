from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import ezdxf
from ezdxf import recover
from scipy.spatial import distance
import tempfile
import os
import io
import numpy as np
# Use string alignment to avoid import resolution issues with ezdxf.enums


app = FastAPI()

# Allow cross-origin requests from the JS frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_hatch_boundaries(hatch_entity):
    boundary_paths = []
    for path in hatch_entity.paths:
        path_points = []
        if hasattr(path, 'vertices') and path.vertices:
            path_points = [(v[0], v[1]) for v in path.vertices]
        elif hasattr(path, 'edges') and path.edges:
            for edge in path.edges:
                if edge.EDGE_TYPE in ("LineEdge", "ArcEdge", "EllipseEdge", "SplineEdge"):
                    path_points.append((edge.start[0], edge.start[1]))
                    path_points.append((edge.end[0], edge.end[1]))
        if path_points and path_points[0] != path_points[-1]:
            path_points.append(path_points[0])
        if path_points:
            boundary_paths.append(path_points)
    return boundary_paths

def get_entity_coordinates(entity):
    #TODO: rever hatch, acho que isto estava para o revit
    if entity.dxftype() == 'HATCH':
        boundaries = extract_hatch_boundaries(entity)
        if boundaries:
            return zip(*boundaries[0])
        return [], []
    elif entity.dxftype() == 'LINE':
        return [entity.dxf.start.x, entity.dxf.end.x], [entity.dxf.start.y, entity.dxf.end.y]
    elif entity.dxftype() in ('LWPOLYLINE', 'POLYLINE'):
        pts = entity.get_points(format='xy') if entity.dxftype() == 'LWPOLYLINE' else [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]
        if pts:
            return zip(*pts)
    return [], []

def compute_angle_with_dot_product(u,v):
    """Calculate the angle and dot product between two vectors."""
    print('Computing angle between:', u, v)
    u = [u[1][0] - u[0][0], u[1][1] - u[0][1]]
    v = [v[1][0] - v[0][0], v[1][1] - v[0][1]]
    dot_product = np.dot(u, v)
    magnitude_u = np.linalg.norm(u)
    magnitude_v = np.linalg.norm(v)
    angle = np.degrees(np.arccos(dot_product / (magnitude_u * magnitude_v)))
    return angle


@app.post("/parse-dxf")
async def parse_dxf(file: UploadFile = File(...)):
    raw_bytes = await file.read()
    
    # Create temporary file on disk
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dxf") as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name
    
    # 3. Read the entire stream into ezdxf
    doc, auditor = recover.readfile(tmp_path)
    
    msp = doc.modelspace()

    layers = [layer.dxf.name for layer in doc.layers]
    entities = []

    for entity in msp.query('LINE LWPOLYLINE POLYLINE HATCH'):
        xs, ys = get_entity_coordinates(entity)
        if xs and ys:
            for i in range(len(xs) - 1):
                entities.append({
                    "handle": entity.dxf.handle + str(i),
                    "type": entity.dxftype(),
                    "layer": entity.dxf.layer,
                    "xs": list(xs[i:i+2]),
                    "ys": list(ys[i:i+2])
                })

    return {"layers": layers, "entities": entities}


class PerfilRequest(BaseModel):
    layerCoords: list
    paperWidth: float

@app.post("/generate-perfil")
async def generate_perfil(data: PerfilRequest):
    print("Received data:", data)
    layerCoords = data.layerCoords
    paperWidth = data.paperWidth

    """ sorted_dict_lat = {}
    for entity in sorted(entities_coordinates, key=lambda x: [x[0], x[1]]):
        key = int(entity[0][0] // 10)
        if key not in sorted_dict_lat:
            sorted_dict_lat[key] = [entity]
        else:
            sorted_dict_lat[key].append(entity)

    print("Sorted dictionary:", sorted_dict_lat) """
    wholePerfil = []
    wholeAngle = []
    for entities_coordinates in layerCoords:

        ordered_perfil = [entities_coordinates[0]]
        angle=[]
        next_entity = ordered_perfil.copy()
        print('Starting Point:', ordered_perfil)
        entities_coordinates.remove(entities_coordinates[0])
        print('Entities Coordinates:', entities_coordinates)


        while len(entities_coordinates) > 0:
            print(next_entity)
            print('Next Entity:', next_entity[-1])
            last_point = next_entity[-1][1]
            print('Last Point:', last_point)
            
                
            next_entity = None
            print("Sorted dictionary:", entities_coordinates)
            print('........')
            print('Ordered Perfil:', ordered_perfil)
            #TODO: confirmar que isto funciona com a esquerda e direita, pq agr assume q o starting point e um extremo
            for i in entities_coordinates:
                if abs(i[0][0] - last_point[0]) < 1e-2 and abs(i[0][1] - last_point[1]) < 1e-2:  # Using a small epsilon for floating-point comparison
                    next_entity = [i]
                    entities_coordinates.remove(i)
                    ordered_perfil.append(i)
                    break
                if abs(i[1][0] - last_point[0]) < 1e-2 and abs(i[1][1] - last_point[1]) < 1e-2:
                    next_entity = i
                    entities_coordinates.remove(i)
                    next_entity_reverse = next_entity.copy()
                    next_entity_reverse[0], next_entity_reverse[1] = next_entity[1], next_entity[0]  # Swap start and end
                    
                    ordered_perfil.append(next_entity_reverse)
                    #TODO: refazer isto de modo a nao ter tantos parentesis
                    next_entity =[ next_entity_reverse]
                    #next_entity[0], next_entity[1] = next_entity[1], next_entity[0]  # Swap back to original order
                    break

            print('......')
            print(next_entity)
            print(len(entities_coordinates))
            print(len(ordered_perfil))
            if not next_entity and len(entities_coordinates) > 0 and len(ordered_perfil)==1:
                #if not left, go right, although should check both sides
                ordered_perfil = [[ordered_perfil[0][1], ordered_perfil[0][0],ordered_perfil[0][2],ordered_perfil[0][3]]]
                next_entity = ordered_perfil.copy()
                continue
            angle.append(compute_angle_with_dot_product(ordered_perfil[-2][0:2], ordered_perfil[-1][0:2]))
        print('Ordered Perfil:', ordered_perfil)
        print('Angles:', angle)
        wholePerfil.append(ordered_perfil)
        wholeAngle.append(angle)
    print('whole perfil', wholePerfil)
    print(wholeAngle)


    # Generate Output DXF
    doc = ezdxf.new(dxfversion="R2010")
    
    msp = doc.modelspace()
    total_distance = 0
    #TODO: ver se isto esta em cm em autocad
    displacement = 0
    for idx in range(len(wholePerfil)):
        ordered_perfil = wholePerfil[idx]
        angle = wholeAngle[idx]
        msp.add_text(
            f"Layer {idx}",
            dxfattribs={
                "height": 2.0,
                "insert": (0, displacement),      # Required baseline insertion point
                "align_point": (0, displacement)  # Required alignment anchor point
            }
        ).set_pos((0, displacement), align="MIDDLE_RIGHT")
        displacement += 2
        max_height = 0
        print(ordered_perfil)
        for i in range(len(ordered_perfil)):

            dist = distance.euclidean(ordered_perfil[i][0], ordered_perfil[i][1])
            if ordered_perfil[i][-1] == 1:
                dist -=paperWidth
            height = ordered_perfil[i][2]
            max_height = max(max_height, height)

            msp.add_line((total_distance, 0 + displacement), (total_distance + dist, 0 + displacement))
            msp.add_line((total_distance, height + displacement), (total_distance + dist, height + displacement))
            if i>0 and height > ordered_perfil[i-1][2]:
                msp.add_line((total_distance, ordered_perfil[i-1][2] + displacement), (total_distance, height + displacement))
            if i==0:
                msp.add_line((total_distance, 0 + displacement), (total_distance, height + displacement))
            #TODO: pensar sobre o erro do angulo
            if i==len(ordered_perfil)-1 or abs(angle[i])>2:
                msp.add_line((total_distance + dist, 0 + displacement), (total_distance + dist, height + displacement))
            total_distance += dist

        
        displacement += max_height
        total_distance = 0

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".dxf")
    doc.saveas(tmp_file.name)
    
    return FileResponse(tmp_file.name, filename="perfil.dxf", media_type="application/dxf")