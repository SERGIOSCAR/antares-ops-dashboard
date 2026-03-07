type Props = {
  className?: string;
};

export default function VesselManagerBrand({ className = "" }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()} aria-label="Antares branding">
      <img
        src="https://antaresshipping.com/wp-content/uploads/2023/12/Antares-Ship-Agent.webp"
        alt="Antares Ship Agents"
        className="h-8 w-auto select-none opacity-70 grayscale"
        loading="lazy"
      />
      <span className="text-[10px] uppercase tracking-wide text-slate-400/80">Ops Platform</span>
    </div>
  );
}
