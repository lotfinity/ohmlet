# FireBeetle 2 ESP32-E model

Source board: DFRobot DFR0654-F (manufacturer STEP and photography).
- Product/wiki: https://wiki.dfrobot.com/dfr0654-f/
- STEP: https://dfimg.dfrobot.com/wiki/24246/DFR0654-F_firebeetle-2-esp32-e_stpfile_V1.0.zip
- Shield photograph: https://dfimg.dfrobot.com/enshop/image/data/DFR0654-F/DFR0654-F_Main_01.jpg
- Underside photograph: https://dfimg.dfrobot.com/enshop/image/data/DFR0654-F/DFR0654-F_Back_04.jpg

The GLB is derived from the manufacturer STEP, tessellated with OpenCascade,
merged by material, welded and decimated with trimesh/fast-simplification.
Female header openings are rebuilt from the CAD dimensions to preserve square
sockets after decimation. The RF shield uses a simplified shell and a rectified
photo finish. Top silkscreen geometry is baked to a transparent 1024 × 2048 texture;
the underside uses a cropped/reoriented manufacturer photograph in a
873 × 2048 texture. The photo is a cosmetic surface approximation, not a
photogrammetric reconstruction. The geometry carries the actual connector
and female-header shape. Small details are simplified for real-time use.

Coordinates: 1 Ohmlet unit = 2.54 mm; Y is height, USB at low Z.
The model has 9,175 triangles and is 401,608 bytes, including textures.
Model source assets and DFRobot marks retain their original ownership;
no MIT license is asserted for manufacturer imagery/CAD.
