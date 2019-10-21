import { Autonomous } from 'autonomous';
declare class PublicCollector extends Autonomous {
    private db;
    private center;
    private latest;
    protected _start(): Promise<void>;
    private connectTrades;
    private connectOrderbook;
    protected _stop(): Promise<void>;
}
export default PublicCollector;
export { PublicCollector };
