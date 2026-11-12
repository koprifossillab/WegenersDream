"""landmap — 칸 메우기와 그때 자리의 칸 지도(tupandactyl 038). numpy 가 없으면 건너뛰고, 판 회전은 원본이 있을 때만."""
import unittest

try:
    import numpy as np
    from pipeline import landmap
    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False

try:
    from pipeline.countries import PARTITION, model_path
    from pipeline.reconstruct import Reconstructor
    HAVE_MODEL = model_path(PARTITION).exists()
except ImportError:
    HAVE_MODEL = False


@unittest.skipUnless(HAVE_NUMPY, "numpy 가 없다")
class FillTest(unittest.TestCase):
    def test_hole_takes_majority(self):
        g = np.array([[1, 1, 2], [1, 0, 2], [1, 1, 2]], dtype=np.uint8)
        self.assertEqual(landmap.fill(g, passes=1)[1, 1], 1)

    def test_lonely_cell_stays_empty(self):
        g = np.zeros((5, 5), dtype=np.uint8)
        g[0, 0] = 3
        self.assertEqual(int(landmap.fill(g).sum()), 3)          # 이웃이 하나뿐인 빈칸은 메우지 않는다(바다를 번지게 하지 않게)

    def test_wraps_longitude(self):
        g = np.zeros((3, 6), dtype=np.uint8)
        g[:, 0] = 4; g[0, 4] = 4
        self.assertEqual(landmap.fill(g, passes=1)[1, 5], 4)     # 동쪽 끝 칸은 서쪽 끝(열 0)과 이웃이다

    def test_paleo_grid_cell(self):
        g = landmap.paleo_grid(np.array([127.2]), np.array([37.6]), np.array([7], dtype=np.uint8))
        r, c = int((90 - 37.6) / landmap.STEP), int((127.2 + 180) / landmap.STEP)
        self.assertEqual(g[r, c], 7)


@unittest.skipUnless(HAVE_MODEL, "PALEOMAP v19o 판 모델이 없다 — python -m pipeline fetch")
class RotateTest(unittest.TestCase):
    def test_matches_reconstructor(self):
        r = Reconstructor()
        lons, lats = np.array([127.0, -100.0, 20.0]), np.array([37.5, 40.0, -30.0])
        a = r.rotate(lons, lats, 200.0)
        b = landmap.rotate_many(r, lons, lats, 200.0)
        self.assertTrue(np.allclose(a[0], b[0], atol=1e-6) and np.allclose(a[1], b[1], atol=1e-6))


if __name__ == "__main__":
    unittest.main()
