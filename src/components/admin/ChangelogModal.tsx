import { CMS_VERSION } from "@/lib/version";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ChangelogItem {
  title: string;
  description: string;
}

interface ChangelogRelease {
  version: string;
  date: string;
  releaseTag?: string;
  isLatest?: boolean;
  highlight: string;
  changes: ChangelogItem[];
}

// Written from the repository's own record (git history, RELEASE.md, STATUS.md
// rollouts) — an operator reads this as fact. Every 1.3.x release after 1.3.1
// and 1.4.0 shipped to the fleet on 27 August; nothing has been numbered since,
// so later work is listed as what it is: running, not yet versioned.
const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: "1.4.0+",
    date: "Sampai 30 September 2026",
    isLatest: true,
    highlight: "Perbaikan sesudah 1.4.0 yang sudah berjalan di toko, belum diberi nomor versi.",
    changes: [
      {
        title: "Redirect 301 landing ke halaman produk",
        description:
          "Landing yang dijadikan halaman produk dialihkan permanen (301) ke /produk/…, dan parameter iklan (fbclid, UTM) tetap terbawa.",
      },
      {
        title: "Form sesuai provinsi",
        description:
          "Semua landing memakai form hybrid: full form untuk provinsi tanpa COD atau yang tidak terbaca, middle form untuk lainnya — termasuk landing yang menjadi halaman produk.",
      },
      {
        title: "Arahkan pembeli COD ke WhatsApp",
        description:
          "Opsional di Settings → Store. Setelah pixel Purchase terkirim, halaman terima kasih membuka chat CS dengan nomor invoice, nama, produk dan varian.",
      },
      {
        title: "Ekspedisi",
        description:
          "Ninja dihapus. Toko baru dimulai dengan JNE dan J&T aktif; toko yang sudah berjalan tetap memakai pengaturannya.",
      },
      {
        title: "Pembayaran QRIS/VA",
        description:
          "Pengecekan otomatis per jam ke AutoLaris kini memeriksa transaksi baru dan yang baru kedaluwarsa, bukan terus transaksi lama.",
      },
      {
        title: "Kecepatan landing page",
        description:
          "Gambar landing CMS di bawah layar pertama dimuat belakangan, dan koneksi awal ke Meta/Google hanya dibuka saat pixel atau tag aktif.",
      },
      {
        title: "Sitemap dan beranda",
        description:
          "Landing native otomatis masuk sitemap dan beranda lewat pekerjaan terjadwal per jam, tanpa menunggu admin membuka daftar landing.",
      },
      {
        title: "Bukti sosial dan alert",
        description:
          "Notifikasi pembelian menampilkan jumlah order nyata 24 jam terakhir; alert operasional menyebut nama toko.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "27 Agustus 2026",
    releaseTag: "2026.08-stock-unlimited",
    highlight: "Stok tidak lagi menghalangi penjualan (ADR-023).",
    changes: [
      {
        title: "Tanpa batas stok",
        description:
          "Stok tidak dibaca saat checkout, konversi CS, maupun saat menentukan produk yang tampil; tidak ada yang mengurangi atau mengembalikan stok.",
      },
    ],
  },
  {
    version: "1.3.5",
    date: "27 Agustus 2026",
    highlight: "Perbaikan cepat daftar pesanan admin yang tampil kosong.",
    changes: [
      {
        title: "Daftar pesanan",
        description:
          "Halaman pesanan admin kembali tampil setelah perubahan komponen di 1.3.4 membuatnya kosong.",
      },
    ],
  },
  {
    version: "1.3.4",
    date: "27 Agustus 2026",
    highlight: "Penguatan pemulihan pembayaran setelah review independen.",
    changes: [
      {
        title: "Pemulihan pembayaran",
        description: "Perbaikan hasil review pada alur pembayaran ulang QRIS/VA.",
      },
    ],
  },
  {
    version: "1.3.3",
    date: "27 Agustus 2026",
    highlight: "Bukti callback pembayaran dan pemulihan dari halaman pembayaran.",
    changes: [
      {
        title: "Callback AutoLaris",
        description:
          "Setiap callback pembayaran dicatat sebagai bukti, tanpa mengubah status pembayaran.",
      },
      {
        title: "Halaman pembayaran",
        description:
          "Pembeli dapat menyalin link pembayaran dan meminta instruksi baru bila yang lama gagal atau kedaluwarsa.",
      },
    ],
  },
  {
    version: "1.3.2",
    date: "27 Agustus 2026",
    highlight: "Login dan pencarian kecamatan tidak lagi bergantung pada kuota KV (ADR-021).",
    changes: [
      {
        title: "Sesi dan rate limit di D1",
        description:
          "Sesi admin dan batas percobaan login disimpan di D1, sehingga login dan pencarian kecamatan tidak gagal saat kuota tulis KV habis.",
      },
    ],
  },
  {
    version: "1.3.1",
    date: "23 Agustus 2026",
    highlight: "Dua celah injeksi script ditutup.",
    changes: [
      {
        title: "Keamanan",
        description:
          "Judul halaman, tag og: dan data JSON di halaman di-escape, sehingga teks dari konten toko tidak bisa menjalankan script.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "22 Agustus 2026",
    releaseTag: "2026.08-landing",
    highlight: "Notifikasi operator dan landing page yang lebih lengkap.",
    changes: [
      {
        title: "Notifikasi operator",
        description: "Pemberitahuan di admin untuk kejadian pendapatan, seperti order baru.",
      },
      {
        title: "Landing page",
        description:
          "Landing page dapat menjadi halaman produk, dan landing native terdaftar di CMS.",
      },
    ],
  },
];

interface ChangelogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogModal({ open, onOpenChange }: ChangelogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-2xl">
        <DialogHeader className="border-b border-slate-200 px-6 py-4 text-left">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-base font-semibold text-slate-950">
              Catatan Rilis
            </DialogTitle>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">
              v{CMS_VERSION.version}
            </span>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Dokumentasi pembaruan fitur, optimasi performa, dan catatan arsitektur AdsBookCMS.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {CHANGELOG_RELEASES.map((rel) => (
            <section
              key={rel.version}
              className="border-b border-slate-100 pb-6 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="font-mono text-sm font-semibold text-slate-950">
                  v{rel.version}
                </h3>
                {rel.isLatest && (
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white">
                    Aktif
                  </span>
                )}
                <span className="text-xs text-slate-400">·</span>
                <time className="text-xs text-slate-500">{rel.date}</time>
                {rel.releaseTag && (
                  <>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="font-mono text-xs text-slate-400">
                      {rel.releaseTag}
                    </span>
                  </>
                )}
              </div>

              <p className="mt-1.5 text-xs text-slate-600">
                {rel.highlight}
              </p>

              <ul className="mt-3 space-y-2 text-xs text-slate-700">
                {rel.changes.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300"
                      aria-hidden="true"
                    />
                    <div>
                      <strong className="font-medium text-slate-900">
                        {item.title}:
                      </strong>{" "}
                      <span className="text-slate-600">{item.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter className="border-t border-slate-200 bg-slate-50/70 px-6 py-3 sm:flex sm:items-center sm:justify-between">
          <div className="text-xs font-mono text-slate-500">
            {CMS_VERSION.coreEngine} · Schema v{CMS_VERSION.schemaVersion}
          </div>
          <DialogClose asChild>
            <Button variant="outline" size="sm" type="button">
              Tutup
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
