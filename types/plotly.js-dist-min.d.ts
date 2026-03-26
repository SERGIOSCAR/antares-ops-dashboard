declare module "plotly.js-dist-min" {
  import Plotly, { Data, Layout, Config, PlotlyHTMLElement, Frames, Font, Annotations } from "plotly.js";
  export { Data, Layout, Config, PlotlyHTMLElement, Frames, Font, Annotations };
  export * from "plotly.js";
  export default Plotly;
}
