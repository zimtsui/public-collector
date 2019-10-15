import Autonomous from 'autonomous';
declare class PublicCollector extends Autonomous {
    private db;
    private okexTrades;
    private okexOrderbook;
    private bitmexTrades;
    private bitmexOrderbook;
    protected _start(): Promise<void>;
    protected _stop(): Promise<void>;
}
export default PublicCollector;
export { PublicCollector };
