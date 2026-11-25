<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('print_jobs', function (Blueprint $table) {
            if (! Schema::hasColumn('print_jobs', 'file_size_bytes')) {
                $table->unsignedBigInteger('file_size_bytes')->default(0)->after('file_hash');
            }
            if (! Schema::hasColumn('print_jobs', 'spooler_job_id')) {
                $table->string('spooler_job_id', 64)->nullable()->after('file_size_bytes');
            }
            if (! Schema::hasColumn('print_jobs', 'completed_at')) {
                $table->timestamp('completed_at')->nullable()->after('pages_printed');
            }
            if (! Schema::hasColumn('print_jobs', 'failed_at')) {
                $table->timestamp('failed_at')->nullable()->after('completed_at');
            }
            if (! Schema::hasColumn('print_jobs', 'error_message')) {
                $table->text('error_message')->nullable()->after('failed_at');
            }
            if (! Schema::hasColumn('print_jobs', 'idempotency_key')) {
                $table->string('idempotency_key', 255)->nullable()->unique()->after('error_message');
            }
        });

        Schema::table('print_job_attempts', function (Blueprint $table) {
            if (! Schema::hasColumn('print_job_attempts', 'tenant_id')) {
                $table->char('tenant_id', 26)->nullable()->after('id');
            }
            if (! Schema::hasColumn('print_job_attempts', 'ended_at')) {
                $table->timestamp('ended_at')->nullable()->after('started_at');
            }
            if (! Schema::hasColumn('print_job_attempts', 'error_details')) {
                $table->text('error_details')->nullable()->after('error_code');
            }
        });
    }

    public function down(): void
    {
        Schema::table('print_jobs', function (Blueprint $table) {
            foreach (['idempotency_key', 'error_message', 'failed_at', 'completed_at', 'spooler_job_id', 'file_size_bytes'] as $col) {
                if (Schema::hasColumn('print_jobs', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::table('print_job_attempts', function (Blueprint $table) {
            foreach (['error_details', 'ended_at', 'tenant_id'] as $col) {
                if (Schema::hasColumn('print_job_attempts', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
