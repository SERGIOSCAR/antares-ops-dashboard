import PortalLogin from "@/components/portal-login";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-slate-900 to-slate-950 p-6">
      <section className="grid w-full max-w-[440px] gap-[1.2rem] rounded-[14px] border border-slate-700 bg-slate-800 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.25)] max-[480px]:p-[1.35rem]">
        <a
          href="https://antaresshipping.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit Antares Shipping website"
        >
          <img
            src="https://antaresshipping.com/wp-content/uploads/2023/12/Antares-Ship-Agent.webp"
            alt="Antares Ship Agency logo"
            className="mx-auto block h-auto w-[min(325px,125%)] max-w-full"
          />
        </a>

        <p className="m-0 text-[0.96rem] leading-[1.5] text-slate-300">
          This is the Antares Operations Team intraweb Apps Manager. For full company information,
          please visit our website.
        </p>

        <PortalLogin embedded />
      </section>
    </main>
  );
}

