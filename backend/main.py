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
            entities.append({
                "handle": entity.dxf.handle,
                "type": entity.dxftype(),
                "layer": entity.dxf.layer,
                "xs": list(xs),
                "ys": list(ys)
            })

    return {"layers": layers, "entities": entities}


class PerfilRequest(BaseModel):
    startingPoint: list
    entitiesCoordinates: list

@app.post("/generate-perfil")
async def generate_perfil(data: PerfilRequest):
    starting_point = data.startingPoint
    entities_coordinates = data.entitiesCoordinates

    sorted_dict_lat = {}
    for entity in sorted(entities_coordinates, key=lambda x: [x[0], x[1]]):
        key = int(entity[0][0] // 10)
        if key not in sorted_dict_lat:
            sorted_dict_lat[key] = [entity]
        else:
            sorted_dict_lat[key].append(entity)

    ordered_perfil = [starting_point]
    start_key = int(starting_point[0][0] // 10)
    
    if start_key in sorted_dict_lat and starting_point in sorted_dict_lat[start_key]:
        sorted_dict_lat[start_key].remove(starting_point)

    while len(sorted_dict_lat) > 0:
        last_point = ordered_perfil[-1][-2]
        next_key = int(last_point[0] // 10)
        
        if next_key not in sorted_dict_lat:
            break
            
        aux = sorted_dict_lat[next_key]
        next_entity = None
        for i in aux:
            if i[0] == last_point:
                next_entity = i
                break

        if not next_entity:
            break

        sorted_dict_lat[next_key].remove(next_entity)
        if len(sorted_dict_lat[next_key]) == 0:
            del sorted_dict_lat[next_key]
            
        ordered_perfil.append(next_entity)

    # Generate Output DXF
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()
    total_distance = 0

    for i in range(len(ordered_perfil)):
        dist = distance.euclidean(ordered_perfil[i][0], ordered_perfil[i][1])
        height = ordered_perfil[i][2]

        msp.add_line((total_distance, 0), (total_distance + dist, 0))
        msp.add_line((total_distance, height), (total_distance + dist, height))
        msp.add_line((total_distance, 0), (total_distance, height))
        msp.add_line((total_distance + dist, 0), (total_distance + dist, height))
        total_distance += dist

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".dxf")
    doc.saveas(tmp_file.name)
    
    return FileResponse(tmp_file.name, filename="perfil.dxf", media_type="application/dxf")