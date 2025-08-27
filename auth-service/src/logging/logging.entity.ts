
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('loggings')
@Index(['logging_idx'], ['createdAt', 'status'])
export class Logging {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column()
    @Index()
    name: string;
    
    @Column({ type: 'text', nullable: true })
    description: string;
    
    @Column({ 
        type: 'enum', 
        enum: ['active', 'inactive', 'pending'],
        default: 'active' 
    })
    status: string;
    
    @Column({ type: 'jsonb', default: {} })
    metadata: Record<string, any>;
    
    @CreateDateColumn()
    createdAt: Date;
    
    @UpdateDateColumn()
    updatedAt: Date;
}
