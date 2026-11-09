import type { Chart } from "./chart"

export function ChartView({ chart, onAgain }: { chart: Chart; onAgain: () => void }) {
  return (
    <section className="chart">
      <article className="paper">
        <div className="eyebrow">ONE BODY · SHARED CHART</div>
        <h1>{chart.title}</h1>
        <div className="meta">
          <div><span>Course</span><b>{chart.course}</b></div>
          <div><span>Duration</span><b>{chart.duration}</b></div>
          <div><span>Disposition</span><b>{chart.disposition}</b></div>
          <div><span>Market cap</span><b>{chart.cap}</b></div>
        </div>
        <table>
          <thead>
            <tr><th>PART</th><th>FINDING</th></tr>
          </thead>
          <tbody>
            {chart.findings.map((finding) => (
              <tr key={finding.part}>
                <td>{finding.part}</td>
                <td>{finding.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="close">{chart.close}</div>
        <div className="sign">ATTENDING · THE MONITOR</div>
        <button className="again" type="button" onClick={onAgain}>Run it again</button>
      </article>
    </section>
  )
}
