"""診断のみを既定にする。UVを変える頂点統合・穴埋めは行わない。"""
import math
import bpy
import bmesh
from mathutils.kdtree import KDTree


def findings(reports, exceptions):
    keys = ('boundary_edges','nonmanifold_edges','duplicate_vertex_pairs','degenerate_faces',
        'isolated_vertices','zero_normals','inconsistent_normal_edges','thin_triangles')
    if set(exceptions) - set(keys) or any(not isinstance(v,str) or not v.strip() for v in exceptions.values()):
        raise ValueError('品質例外は診断キーと空でない理由文字列で指定してください')
    return [dict(object=r['object'],check=k,count=r[k],status='accepted' if k in exceptions else 'review',
        reason=exceptions.get(k,'')) for r in reports for k in keys if r[k]]


def mesh_report(meshes):
    result = []
    for obj in meshes:
        mesh = obj.data
        mesh.calc_loop_triangles()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        tree = KDTree(len(mesh.vertices))
        for v in mesh.vertices:
            tree.insert(v.co, v.index)
        tree.balance()
        duplicate_pairs = sum(sum(j > v.index for _, j, _ in tree.find_range(v.co, 1e-6)) for v in mesh.vertices)
        result.append(dict(object=obj.name, vertices=len(mesh.vertices), triangles=len(mesh.loop_triangles),
            boundary_edges=sum(e.is_boundary for e in bm.edges), nonmanifold_edges=sum(not e.is_manifold for e in bm.edges),
            duplicate_vertex_pairs=duplicate_pairs, degenerate_faces=sum(f.calc_area() < 1e-12 for f in bm.faces),
            isolated_vertices=sum(not v.link_edges for v in bm.verts),
            zero_normals=sum(v.normal.length < .5 for v in bm.verts),
            inconsistent_normal_edges=sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
            thin_triangles=sum(max((mesh.vertices[t.vertices[i]].co-mesh.vertices[t.vertices[(i+1)%3]].co).length_squared for i in range(3))/max(t.area,1e-12) > 100 for t in mesh.loop_triangles),
            uv_layers=len(mesh.uv_layers)))
        bm.free()
    return result


def skin_report(meshes, arm):
    missing = over = root = bad_sum = 0
    for obj in meshes:
        names = {g.index: g.name for g in obj.vertex_groups}
        for v in obj.data.vertices:
            weights = [(names.get(g.group), g.weight) for g in v.groups if g.weight > 1e-6]
            missing += not weights
            over += len(weights) > 4
            root += any(n == 'Root' for n,w in weights)
            bad_sum += abs(sum(w for n,w in weights)-1) > 1e-4
    return dict(bones={b.name: b.parent.name if b.parent else None for b in arm.data.bones}, unassigned=missing, over_four=over, root_weights=root, unnormalized=bad_sum)


def materials(meshes):
    out = []
    for obj in meshes:
        for mat in obj.data.materials:
            if not mat or not mat.use_nodes:
                raise ValueError(f'マテリアル欠落: {obj.name}')
            images = [n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
            # importerが画像デコードを遅延するためhas_data単独では欠落と判定しない。
            if not images or any(len(i.pixels) == 0 or min(i.size) <= 0 for i in images):
                raise ValueError(f'テクスチャ欠落: {obj.name}')
            out.append(dict(object=obj.name, material=mat.name, images=[dict(name=i.name,size=list(i.size),packed=bool(i.packed_file)) for i in images]))
    return out


def deformation(meshes, arm, actions):
    from motion import reset
    results = []
    for action, end in actions:
        arm.animation_data.action = action
        maximum = 1
        for frame in sorted({1, end//4, end//2, 3*end//4, end}):
            bpy.context.scene.frame_set(frame)
            graph = bpy.context.evaluated_depsgraph_get()
            for obj in meshes:
                evaluated = obj.evaluated_get(graph)
                mesh = evaluated.to_mesh()
                try:
                    if any(not math.isfinite(x) for v in mesh.vertices for x in v.co):
                        raise ValueError('非有限座標の変形')
                    for edge in obj.data.edges:
                        a,b = edge.vertices
                        rest = (obj.data.vertices[a].co-obj.data.vertices[b].co).length
                        moved = (mesh.vertices[a].co-mesh.vertices[b].co).length
                        if rest > 1e-5:
                            maximum = max(maximum, moved/rest)
                finally:
                    evaluated.to_mesh_clear()
        results.append(dict(clip=action.name, sampled_frames=5, maximum_edge_stretch=maximum, requires_review=maximum>2))
    reset(arm)
    return results
