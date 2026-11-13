"""relief — 배경 그림의 보간·해안 고르기·타일(tupandactyl 040). numpy·Pillow·scipy·netCDF4 가 있을 때만 돈다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

try:
    import numpy as np
    from pipeline import relief
    HAVE_LIBS = True
except ImportError:                      # CI 는 파이프라인 의존성을 깔지 않는다
    HAVE_LIBS = False


@unittest.skipUnless(HAVE_LIBS, "numpy·Pillow·scipy·netCDF4 가 없다")
class ReliefTest(unittest.TestCase):
    def test_resample_keeps_grid_values_in_place(self):
        z = np.tile(np.linspace(-1000, 1000, 361), (181, 1))          # 경도로 고르게 오르는 비탈
        out = relief.resample(z, 720)
        self.assertEqual(out.shape, (360, 720))
        self.assertAlmostEqual(float(out[180, 0]), -1000 + 2000 * 0.25 / 360, delta=1)      # 첫 픽셀의 가운데는 −179.75°
        self.assertAlmostEqual(float(out[180, 360]), 2000 * 0.25 / 360, delta=1)

    def test_checkerboard_shelf_is_one_colour(self):
        """0 m 언저리에서 칸마다 부호가 바뀌는 대륙붕은 바다 하나로 — 바둑판처럼 칠하지 않는다."""
        z = np.full((181, 361), -3000.0)
        z[60:120, 100:200] = np.where((np.indices((60, 100)).sum(axis=0) % 2) == 0, 5.0, -20.0)
        rgb, _ = relief.render(z, 720)
        patch = rgb[140:220, 220:380].reshape(-1, 3)
        self.assertLess(len({tuple(p) for p in patch[:, :2] // 16}), 4)

    def test_tiles_cover_the_world(self):
        rgb = np.zeros((relief.TOP // 2, relief.TOP, 3), dtype=np.uint8)
        with tempfile.TemporaryDirectory() as d, mock.patch.object(relief, "DERIVED", Path(d)), \
                mock.patch.object(relief, "save", lambda image, name: Path(d, name).parent.mkdir(parents=True, exist_ok=True) or Path(d, name).touch()):
            out = relief.tiles(rgb, "2500")
            names = sorted(p.name for p in Path(d, "basemap", "tiles", "2500").iterdir())
        self.assertEqual(out["url"], "basemap/tiles/2500/{x}_{y}.webp")
        self.assertEqual(len(names), (relief.TOP // relief.TILE) * (relief.TOP // 2 // relief.TILE))
        self.assertIn("31_15.webp", names)


if __name__ == "__main__":
    unittest.main()
