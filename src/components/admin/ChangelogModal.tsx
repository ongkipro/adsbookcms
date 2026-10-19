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

// Written from the repository's own record (git history, RELEASE.md, BUILD-LOG)
// — an operator reads this as fact. The first entry is the running version:
// changelog.test.ts fails when version.ts moves without a matching entry here.
const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: "1.6.0",
    date: "20 Oktober 2026",
    releaseTag: "2026.10-plugins",
    isLatest: true,
    highlight: "Fitur opsional kini berupa plugin: tidak terpasang sampai toko mengaktifkannya.",
    changes: [
      {
        title: "Halaman Plugin",
        description:
          "Pengaturan → Plugin menampilkan fitur opsional toko. Owner memasang dan mengaktifkannya sendiri; menonaktifkan tidak menghapus data, dan Hapus data menghapus tabel plugin itu.",
      },
      {
        title: "Kelola CRM menjadi plugin",
        description:
          "Sambungan Kelola pindah dari Profil & Integrasi ke Pengaturan → Plugin → Kelola CRM. Toko yang tidak mengaktifkannya tidak membawa tabel maupun menu Kelola.",
      },
    ],
  },
  {
    version: "1.5.12",
    date: "19 Oktober 2026",
    releaseTag: "2026.10-landing-hero-h1",
    highlight: "Order dan pesanan tertinggal bisa dikirim otomatis ke Kelola CRM untuk ditindaklanjuti tim.",
    changes: [
      {
        title: "Order masuk ke Penjualan Kelola",
        description:
          "Tempel URL webhook dan secret dari Kelola (sejak 1.6.0 di Pengaturan → Plugin). Setiap order baru dikirim setelah checkout tanpa menunda pembeli, dicoba ulang tiap jam selama 24 jam, dan bisa dikirim ulang dari detail order.",
      },
      {
        title: "Pesanan tertinggal untuk follow-up",
        description:
          "Pesanan tertinggal yang 30 menit kemudian masih belum jadi order dikirim ke menu Data tertinggal di Kelola — terpisah dari Penjualan, jadi omzet tidak menggelembung.",
      },
      {
        title: "Halaman asal order",
        description: "Setiap order mencatat halaman (landing page) tempat pembeli memesan, terlihat di detail order.",
      },
    ],
  },
  {
    version: "1.5.11",
    date: "19 Oktober 2026",
    releaseTag: "2026.10-landing-hero-h1",
    highlight: "Landing page dengan HTML sendiri tidak lagi memicu request sia-sia setiap kali dibuka.",
    changes: [
      {
        title: "Gambar pemicu script tanpa request",
        description:
          "Gambar tersembunyi berisi onerror (src=\"x\") yang dipakai HTML landing untuk menjalankan script kini memakai data kosong. Script tetap berjalan, tetapi tidak ada lagi request 404 ke server di setiap kunjungan.",
      },
    ],
  },
  {
    version: "1.5.10",
    date: "16 Oktober 2026",
    releaseTag: "2026.10-landing-hero-h1",
    highlight: "Deploy ditolak bila akan menghapus landing page native yang sedang tayang.",
    changes: [
      {
        title: "Landing native dijaga saat deploy",
        description:
          "Sebelum deploy, preflight membandingkan landing page native di database produksi dengan daftar di kode. Bila ada yang tidak terdaftar, deploy ditolak karena sinkronisasi per jam akan menghapusnya.",
      },
    ],
  },
  {
    version: "1.5.9",
    date: "16 Oktober 2026",
    releaseTag: "2026.10-landing-hero-h1",
    highlight: "Setiap landing page punya tepat satu judul utama.",
    changes: [
      {
        title: "H1 dobel di HTML dijadikan H2",
        description:
          "Bila HTML landing page memuat lebih dari satu H1, hanya yang pertama tetap H1; sisanya menjadi H2 dengan tampilan yang sama.",
      },
      {
        title: "Landing tanpa judul tetap punya H1",
        description:
          "Landing page yang seluruhnya HTML tanpa H1 dan tanpa section headline kini memuat judul halamannya sebagai H1 tersembunyi untuk mesin pencari dan pembaca layar.",
      },
    ],
  },
  {
    version: "1.5.8",
    date: "15 Oktober 2026",
    releaseTag: "2026.10-landing-hero-h1",
    highlight: "Judul utama landing page tidak pernah dobel.",
    changes: [
      {
        title: "Satu H1 per landing page",
        description:
          "Bila section HTML sudah memuat judul H1, section headline tidak lagi ikut menjadi H1. Headline yang datanya rusak dan tidak tampil juga tidak dipilih sebagai judul utama.",
      },
    ],
  },
  {
    version: "1.5.7",
    date: "15 Oktober 2026",
    releaseTag: "2026.10-landing-hero-h1",
    highlight: "Gambar pembuka landing page tampil lebih cepat, dan judul pertamanya menjadi judul utama halaman.",
    changes: [
      {
        title: "Gambar pertama tidak lagi menunggu scroll",
        description:
          "Bila section pertama landing page adalah gambar, gambar itu dimuat langsung dengan prioritas tinggi. Gambar berikutnya tetap dimuat saat discroll.",
      },
      {
        title: "Landing page punya judul utama (H1)",
        description:
          "Section headline pertama kini dirender sebagai H1, jadi halaman — termasuk landing yang menjadi halaman produk — punya satu judul utama untuk mesin pencari. Tampilannya tidak berubah.",
      },
    ],
  },
  {
    version: "1.5.6",
    date: "15 Oktober 2026",
    releaseTag: "2026.10-fleet-status",
    highlight: "Deploy menolak bila database produksi punya migrasi yang tidak ada di kode.",
    changes: [
      {
        title: "Deploy tidak lagi bisa mematikan toko",
        description:
          "Sebelum upload, pemeriksaan deploy membandingkan migrasi yang sudah dijalankan di database produksi dengan file di kode. Bila ada yang hilang, deploy dihentikan dan nama migrasinya disebutkan.",
      },
      {
        title: "Skor penerima lebih hemat dan tahan salah",
        description:
          "Order yang baru ditolak Mengantar tidak dicek ulang setiap kali halaman dibuka, pengecekan per jam berhenti saat Mengantar lambat, dan ringkasan skor yang tidak wajar tidak lagi terbaca sebagai risiko tinggi.",
      },
    ],
  },
  {
    version: "1.5.5",
    date: "15 Oktober 2026",
    releaseTag: "2026.10-fleet-status",
    highlight: "Risiko RTS memberi tahu saat Mengantar menolak akses, dan menyusul sendiri setelah dibuka.",
    changes: [
      {
        title: "Akses skor penerima terlihat",
        description:
          "Mengantar kini membatasi cek skor penerima ke akun yang di-whitelist. Bila ditolak, detail order dan panel kesehatan dashboard menyebutkannya, dengan langkah meminta akses ke CS Mengantar.",
      },
      {
        title: "Skor resmi Mengantar",
        description:
          "Persentase dan nilai huruf (A sampai E-) diambil dari ringkasan skor Mengantar. Nomor tanpa riwayat tercatat sudah dicek, bukan lagi \"Belum dinilai\" selamanya.",
      },
      {
        title: "Menyusul otomatis",
        description:
          "Setiap jam, order 30 hari terakhir yang belum dinilai dicek ulang, sampai 20 per jam.",
      },
    ],
  },
  {
    version: "1.5.4",
    date: "12 Oktober 2026",
    releaseTag: "2026.10-fleet-status",
    highlight: "Notifikasi bukti sosial tidak menutupi layar pertama landing.",
    changes: [
      {
        title: "Layar pertama, bukan section pertama",
        description:
          "Di landing CMS, notifikasi menunggu sampai pembeli menggulir melewati layar pertama, apa pun isi section pertamanya. Landing yang seluruh isinya ditaruh dalam satu section kini juga menampilkan notifikasi.",
      },
    ],
  },
  {
    version: "1.5.3",
    date: "12 Oktober 2026",
    releaseTag: "2026.10-fleet-status",
    highlight: "Notifikasi bukti sosial di landing CMS ikut menghindari hero.",
    changes: [
      {
        title: "Seperti tombol sticky",
        description:
          "Landing CMS menyembunyikan notifikasi di atas hero dan di atas form, sama seperti landing native dan halaman produk.",
      },
    ],
  },
  {
    version: "1.5.2",
    date: "12 Oktober 2026",
    releaseTag: "2026.10-fleet-status",
    highlight: "Tampilan baru notifikasi bukti sosial.",
    changes: [
      {
        title: "Kartu yang lebih jelas",
        description:
          "Latar putih solid, jumlah pemesan ditebalkan dengan \"dalam 24 jam terakhir\" di baris kedua, dan ikon dengan penanda live yang berhenti berdenyut bila perangkat meminta gerak dikurangi.",
      },
      {
        title: "Aturan tetap",
        description:
          "Hanya order nyata, sekali per kunjungan, tersembunyi di hero, di form, dan saat pembeli mengisi form.",
      },
    ],
  },
  {
    version: "1.5.1",
    date: "12 Oktober 2026",
    releaseTag: "2026.10-checkout-tracking",
    highlight: "Event Meta dari browser tidak lagi hilang sebelum pixel siap.",
    changes: [
      {
        title: "Urutan pixel Meta",
        description:
          "ViewContent, AddToCart, InitiateCheckout dan Purchase dari browser menunggu inisialisasi pixel (dengan advanced matching), sehingga tidak ada event yang terbuang dan pasangan browser–server tetap cocok.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "11 Oktober 2026",
    releaseTag: "2026.10-checkout-tracking",
    highlight: "Semua perbaikan sejak 1.4.0 diberi nomor versi, ditambah pelacakan checkout dan tombol order mobile.",
    changes: [
      {
        title: "Tombol order di HP",
        description:
          "Tombol \"Buat Order\" selalu merespons ketukan: form kosong langsung memfokuskan field yang belum diisi, dan isian autofill langsung mengaktifkan tombol.",
      },
      {
        title: "Varian yang benar di order",
        description:
          "Bila SKU sebuah varian sama dengan id varian lain, id varian yang menang, sehingga order masuk dengan varian yang dipilih pembeli.",
      },
      {
        title: "Data ecommerce GA4/GTM",
        description:
          "Item di dataLayer membawa harga satuan dan jumlah, dan GTM noscript ikut terpasang.",
      },
      {
        title: "Kurir SPX",
        description:
          "SPX (Shopee Express) dari Mengantar tersedia di pengaturan ekspedisi.",
      },
      {
        title: "Kunci sesi otomatis",
        description:
          "Toko baru tidak perlu membuat AUTH_SECRET sendiri; Worker membuat kunci sesi admin pada pemakaian pertama.",
      },
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
