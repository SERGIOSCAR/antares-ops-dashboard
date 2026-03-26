declare module "react-plotly.js" {
  import * as React from "react";
  import Plotly from "plotly.js-dist-min";

  export interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: any, graphDiv: Plotly.PlotlyHTMLElement) => void;
    onUpdate?: (figure: any, graphDiv: Plotly.PlotlyHTMLElement) => void;
    onPurge?: (graphDiv: Plotly.PlotlyHTMLElement) => void;
    useResizeHandler?: boolean;
  }

  export default class Plot extends React.Component<PlotParams> {}
}
